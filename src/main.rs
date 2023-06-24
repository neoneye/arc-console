use futures_util::{SinkExt, StreamExt};
use log::*;
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, Arc};
use std::{net::SocketAddr, time::Duration};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{accept_async, tungstenite::Error};
use tokio_tungstenite::tungstenite::{Message, Result};

extern crate log;
extern crate env_logger;

type StringQueue = Arc<Mutex<Vec<String>>>;

async fn accept_connection(peer: SocketAddr, stream: TcpStream, string_queue: StringQueue) {
    if let Err(e) = handle_connection(peer, stream, string_queue).await {
        match e {
            Error::ConnectionClosed | Error::Protocol(_) | Error::Utf8 => (),
            err => error!("Error processing connection: {}", err),
        }
    }
}

/// Forward incoming WebSocket messages and send a `tick` message periodically.
async fn handle_connection(peer: SocketAddr, stream: TcpStream, string_queue: StringQueue) -> Result<()> {
    let ws_stream = accept_async(stream).await.expect("Failed to accept");
    info!("New WebSocket connection: {}", peer);
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    let mut interval = tokio::time::interval(Duration::from_secs(1));

    loop {
        tokio::select! {
            msg = ws_receiver.next() => {
                match msg {
                    Some(msg) => {
                        let msg = msg?;
                        if msg.is_text() ||msg.is_binary() {
                            ws_sender.send(msg).await?;
                        } else if msg.is_close() {
                            break;
                        }
                    }
                    None => break,
                }
            }
            _ = interval.tick() => {
                let mut items = Vec::<String>::new();
                match string_queue.lock() {
                    Ok(mut v) => {
                        items = v.drain(0..).collect();
                    },
                    Err(error) => {
                        error!("handle_connection: unable to lock string_queue. {:?}", error);
                    }
                }
                items.reverse();
                let count = items.len();
                for item in items {
                    ws_sender.send(Message::Text(item)).await?;
                }
                if count == 0 {
                    ws_sender.send(Message::Text("tick".to_owned())).await?;
                }
            }
        }
    }

    Ok(())
}

#[derive(Debug, Deserialize)]
struct PostMessage {
    message: String,
}

#[derive(Clone)]
struct State {
    config_websocket_port: u16,
    string_queue: StringQueue,
}

async fn post_event(mut req: tide::Request<State>) -> tide::Result {
    let post_message: PostMessage = req.body_json().await?;

    match req.state().string_queue.lock() {
        Ok(mut v) => {
            let message: String = post_message.message.clone();
            debug!("post_event: message: {:?}", message);
            v.insert(0, message);
        },
        Err(error) => {
            error!("post_event: cannot lock message queue: {:?}", error);
        }
    }

    let response = tide::Response::builder(200)
        .body("ok")
        .content_type("text/plain; charset=utf-8")
        .build();
    Ok(response)
}

#[derive(Debug, Serialize)]
struct ConfigFields {
    websocketport: String,
}

async fn get_config(req: tide::Request<State>) -> tide::Result {
    let config_websocket_port: u16 = req.state().config_websocket_port;
    let config = ConfigFields {
        websocketport: config_websocket_port.to_string(),
    };
    let mut res = tide::Response::new(200);
    res.set_body(tide::Body::from_json(&config)?);
    Ok(res)
}

async fn webserver_with_metrics(webserver_address: &str, config_websocket_port: u16, string_queue: StringQueue) -> std::result::Result<(), Box<dyn std::error::Error>> {
    println!("Webserver - Listening on: '{}' - Open this in the browser to see the console.", webserver_address);
    println!("CTRL-C to stop the server.");
    let mut app = tide::with_state(State {
        config_websocket_port: config_websocket_port,
        string_queue
    });
    app.at("/").serve_file("data/welcome.html")?;
    app.at("/data").serve_dir("data/")?;
    app.at("/event").post(post_event);
    app.at("/config").get(get_config);
    app.listen(webserver_address).await?;
    Ok(())
}

#[tokio::main]
async fn main() {
    env_logger::init();

    let server_name = "localhost";
    // let server_name = "0.0.0.0";
    let server_web_port: u16 = 9000;
    let server_socket_port: u16 = 9001;

    let webserver_address = format!("{}:{}", server_name, server_web_port);
    let websocket_address = format!("{}:{}", server_name, server_socket_port);

    let message_queue = Vec::<String>::new();
    let string_queue: StringQueue = Arc::new(Mutex::new(message_queue));

    let string_queue_clone: StringQueue = string_queue.clone();
    let _ = tokio::spawn(async move {
        let result = webserver_with_metrics(&webserver_address, server_socket_port, string_queue_clone).await;
        if let Err(error) = result {
            panic!("webserver thread failed with error: {:?}", error);
        }
    });

    let listener = TcpListener::bind(&websocket_address).await.expect("Can't listen");
    info!("Websocket - Listening on: {}", websocket_address);

    while let Ok((stream, _)) = listener.accept().await {
        let peer = stream.peer_addr().expect("connected streams should have a peer address");
        info!("Peer address: {}", peer);

        tokio::spawn(accept_connection(peer, stream, string_queue.clone()));
    }
}
