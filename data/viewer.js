
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class PageController {
    constructor() {
      this.mHasUnsavedChanges = false; 
      this.mAlwaysScrollToBottom = false;
      this.mTicksWithoutActivity = 0;

      this.focusKeyboardScrollWorks();

      const el = document.getElementById("main-inner");
      const self = this;
      el.onscroll = function(e) {
        const check = el.scrollTop === (el.scrollHeight - el.offsetHeight);
        if (check) {
          self.mAlwaysScrollToBottom = true;
        } else {
          self.mAlwaysScrollToBottom = false;
        }
      };

      this.demo1();
      this.demo2();
      this.demo3();
      this.fetchConfigAndSetup();
      this.setupKeyboardShortcuts();
    }
    
    fetchConfigAndSetup() {
      fetch('/config')
      .then((response) => response.json())
      .then((config) => {
        // console.log("config", config);
        const port = config["websocketport"];
        const host = window.location.hostname; 
        const url = `ws://${host}:${port}`;
        // console.log("websocket url: ", url);
        this.setupWebsocket(url);
        this.hideOverlay();
      });
    }

    setupWebsocket(url) {
      const instance = this;
      // the url looks like this "ws://localhost:9002/socketserver"
      const socket = new WebSocket(url);
      socket.onclose = function(event) {
        if (event.wasClean) {
          console.log(`[close] Connection closed cleanly, code=${event.code} reason=${event.reason}`);
          instance.appendErrorText(`[close] Connection closed cleanly, code=${event.code} reason=${event.reason}`);
        } else {
          // e.g. server process killed or network down
          // event.code is usually 1006 in this case
          console.log('[close] Connection died');
          instance.appendErrorText('[close] Connection died');
        }
      };

      socket.onerror = function(error) {
        console.error("[error]", error);
        instance.appendErrorText(`[error] ${error}`);
      };
      
      socket.onopen = (event) => {
        console.log("[open] Connection established");
        socket.send("ready");
        instance.appendInfoText('[open] Connection established');
      }
      
      socket.onmessage = (event) => {
        const html = event.data;
        if (html == "tick") {
          instance.mTicksWithoutActivity += 1;
          if (instance.mTicksWithoutActivity > 10) {
            instance.updateOutputBottomRow(`Listening. No activity for ticks: ${instance.mTicksWithoutActivity}`);
          }
        } else {
          instance.mTicksWithoutActivity = 0;
          instance.appendInfoHtml(html);
          instance.updateOutputBottomRow("Listening &hellip;");
        }
      }
    }
    
    clearOutputAction() {
      const div = document.getElementById("output-rows");
      div.innerHTML = '';
      this.focusKeyboardScrollWorks();
    }

    focusKeyboardScrollWorks() {
      document.getElementById("output-rows").focus();
    }
  
    demo1() {
      const s = "<div class=\"image nonempty\"><span class=\"size\">2x2</span><span class=\"rows\"><span class=\"row\"><span class=\"symbol_0\">0</span><span class=\"symbol_1\">1</span></span><span class=\"row\"><span class=\"symbol_2\">2</span><span class=\"symbol_3\">3</span></span></span></div>";
      this.appendInfoHtml(s);
    }

    demo2() {
      const s = "I'm an<br>error<br>message that spans<br>multiple<br>lines!";
      this.appendErrorHtml(s);
    }

    demo3() {
      const s = "I'm a text error message with symbols <>[]!/.";
      this.appendErrorText(s);
    }

    timestampString() {
      const options = {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      };
      const today = new Date();
      return today.toLocaleTimeString([], options);
    }
    
    appendInfoText(text) {
      this.appendInfoMessageInner(text, false);
    }
    
    appendInfoHtml(html) {
      this.appendInfoMessageInner(html, true);
    }
    
    appendInfoMessageInner(content, isHtml) {
      const element0 = document.createElement("div");
      element0.className = "info-message output-row-col0";
      element0.textContent = this.timestampString();

      const element1 = document.createElement("div");
      element1.className = "info-message output-row-col1";
      if (isHtml) {
        element1.innerHTML = content;
      } else {
        element1.innerText = content;
      }

      const parentDiv = document.getElementById("output-rows");
      parentDiv.appendChild(element0);
      parentDiv.appendChild(element1);
      this.updateScroll();
    }

    appendErrorText(text) {
      this.appendErrorMessageInner(text, false);
    }

    appendErrorHtml(html) {
      this.appendErrorMessageInner(html, true);
    }

    appendErrorMessageInner(content, isHtml) {
      const element0 = document.createElement("div");
      element0.className = "error-message output-row-col0";
      element0.textContent = this.timestampString();

      const element1 = document.createElement("div");
      element1.className = "error-message output-row-col1";
      if (isHtml) {
        element1.innerHTML = content;
      } else {
        element1.innerText = content;
      }

      const parentDiv = document.getElementById("output-rows");
      parentDiv.appendChild(element0);
      parentDiv.appendChild(element1);
      this.updateScroll();
    }

    updateOutputBottomRow(html) {
      const element = document.getElementById("output-bottom-row");
      element.innerHTML = html;
    }
    
    updateScroll() {
      if (this.mAlwaysScrollToBottom == false) {
        return;
      }
      const nestedElement = document.getElementById("main-inner");
      nestedElement.scrollTo(0, nestedElement.scrollHeight);
    }
  
    hideOverlay() {
        document.getElementById("overlay").style.display = "none";
    }
  
    showOverlay() {
        document.getElementById("overlay").style.display = "block";
    }

    setupKeyboardShortcuts() {
      let self = this;
      let keydownHandler = function(event) {
          if(event.defaultPrevented) {
              return; // Should do nothing if the default action has been cancelled
          }
          // const isMetaKey = event.metaKey || event.ctrlKey;
          // const isEnterKeyCode = (event.keyCode == 10) || (event.keyCode == 13);
          const isEscapeKeyCode = (event.keyCode == 27);
          // intercept CTRL+ENTER, and run the program.
          // if(isEnterKeyCode && isMetaKey) {
          //     console.log("ctrl+enter: submit form");
          //     event.preventDefault(); // Suppress "double action"
          //     self.runAction();
          //     return;
          // }
          // intercept ESCape key, and toggle scroll to bottom
          if(isEscapeKeyCode) {
              console.log("key: escape");
              event.preventDefault(); // Suppress "double action"
              self.toggleScrollToBottomAction();
              return;
          }
      };
      window.addEventListener('keydown', keydownHandler, true);
    }

    toggleScrollToBottomAction() {
      this.mAlwaysScrollToBottom = (this.mAlwaysScrollToBottom == false);
      this.updateScroll();
      this.focusKeyboardScrollWorks();
    }

    developerPageAction() {
      window.open(
        "developer.html",
        '_blank' // Open in a new window.
      );
    }
}
  
var gPageController = null;
  
function body_onload() {
    gPageController = new PageController();
}
  
function body_onbeforeunload() {
    if (gPageController.mHasUnsavedChanges) {
      return "The data on this page will be lost if you leave";
    } else {
      return undefined;
    }
}
