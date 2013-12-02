// Generated by CoffeeScript 1.4.0
(function() {
  "use strict";
  var RemoteDevice, exports,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    __slice = [].slice;

  var exports = window;

  /*
   * Represents a device running CIRC and handles communication to/from that
   * device.
  */


  RemoteDevice = (function(_super) {

    __extends(RemoteDevice, _super);

    /*
       * Begin at this port and increment by one until an open port is found.
    */


    RemoteDevice.BASE_PORT = 1329;

    RemoteDevice.MAX_CONNECTION_ATTEMPTS = 30;

    RemoteDevice.FINDING_PORT = -1;

    RemoteDevice.NO_PORT = -2;

    function RemoteDevice(addr, port) {
      this._listenOnValidPort = __bind(this._listenOnValidPort, this);
      this._onReceive = __bind(this._onReceive, this);
      this._onReceiveError = __bind(this._onReceiveError, this);
      RemoteDevice.__super__.constructor.apply(this, arguments);
      this._receivedMessages = '';
      this.id = addr;
      this._isClient = false;
      if (typeof addr === 'string') {
        this._initFromAddress(addr, port);
      } else if (addr) {
        this._initFromSocketId(addr);
      } else {
        this.port = RemoteDevice.FINDING_PORT;
      }
    }

    RemoteDevice.prototype.equals = function(otherDevice) {
      return this.id === (otherDevice != null ? otherDevice.id : void 0);
    };

    RemoteDevice.prototype.usesConnection = function(connectionInfo) {
      return connectionInfo.addr === this.addr && connectionInfo.port === this.port;
    };

    RemoteDevice.prototype.getState = function() {
      if (!this.addr) {
        return 'no_addr';
      }
      switch (this.port) {
        case RemoteDevice.FINDING_PORT:
          return 'finding_port';
        case RemoteDevice.NO_PORT:
          return 'no_port';
        default:
          return 'found_port';
      }
    };

    RemoteDevice.prototype._initFromAddress = function(addr, port) {
      this.addr = addr;
      this.port = port;
    };

    RemoteDevice.prototype._initFromSocketId = function(_socketId) {
      this._socketId = _socketId;
      this._isClient = true;
      return this._listenForData();
    };

    RemoteDevice.getOwnDevice = function(callback) {
      var device,
        _this = this;
      device = new RemoteDevice;
      if (!device.hasGetNetworkInterfacesSupport()) {
        callback(device);
        return;
      }
      if (!api.listenSupported()) {
        device.port = RemoteDevice.NO_PORT;
      }
      return device.findPossibleAddrs(function() {
        return callback(device);
      });
    };

    RemoteDevice.prototype.findPossibleAddrs = function(callback) {
      var _this = this;
      return chrome.system.network.getNetworkInterfaces(function(networkInfoList) {
        var networkInfo;
        _this.possibleAddrs = (function() {
          var _i, _len, _results;
          _results = [];
          for (_i = 0, _len = networkInfoList.length; _i < _len; _i++) {
            networkInfo = networkInfoList[_i];
            _results.push(networkInfo.address);
          }
          return _results;
        })();
        _this.addr = _this._getValidAddr(_this.possibleAddrs);
        return callback();
      });
    };

    RemoteDevice.prototype._getValidAddr = function(addrs) {
      var addr, shortest, _i, _len;
      if (!addrs || addrs.length === 0) {
        return void 0;
      }
      /*
           * TODO currently we return the first IPv4 address. Will this always work?
      */

      shortest = addrs[0];
      for (_i = 0, _len = addrs.length; _i < _len; _i++) {
        addr = addrs[_i];
        if (addr.length < shortest.length) {
          shortest = addr;
        }
      }
      return shortest;
    };

    RemoteDevice.prototype.hasGetNetworkInterfacesSupport = function() {
      if (api.getNetworkInterfacesSupported()) {
        return true;
      }
      this._log('w', 'chrome.system.network.getNetworkInterfaces is not supported!');
      this.possibleAddrs = [];
      this.port = RemoteDevice.NO_PORT;
      return false;
    };

    /*
       * Call chrome.system.network.getNetworkInterfaces in an attempt to find a valid address.
    */


    RemoteDevice.prototype.searchForAddress = function(callback, timeout) {
      var _this = this;
      if (timeout == null) {
        timeout = 500;
      }
      if (!this.hasGetNetworkInterfacesSupport()) {
        return;
      }
      if (timeout > 60000) {
        timeout = 60000;
      }
      return setTimeout((function() {
        return _this.findPossibleAddrs(function() {
          if (_this.addr) {
            return callback();
          } else {
            return _this.searchForAddress(callback, timeout *= 1.2);
          }
        });
      }), timeout);
    };

    /*
       * Called when the device is your own device. Listens for connecting client
       * devices.
    */


    RemoteDevice.prototype.listenForNewDevices = function(callback) {
      var _ref,
        _this = this;
      return (_ref = chrome.sockets.tcpServer) != null ? _ref.create({}, function(socketInfo) {
        _this._socketId = socketInfo.socketId;
        registerTcpServer(socketInfo.socketId);
        if (api.listenSupported()) {
          return _this._listenOnValidPort(callback);
        }
      }) : void 0;
    };

    /*
       * Attempt to listen on the default port, then increment the port by a random
       * amount if the attempt fails and try again.
    */


    RemoteDevice.prototype._listenOnValidPort = function(callback, port) {
      var _this = this;
      if (!(port >= 0)) {
        port = RemoteDevice.BASE_PORT;
      }
      return chrome.sockets.tcpServer.listen(this._socketId, '0.0.0.0', port, function(result) {
        return _this._onListen(callback, port, result);
      });
    };

    RemoteDevice.prototype._onListen = function(callback, port, result) {
      if (result < 0) {
        return this._onFailedToListen(callback, port, result);
      } else {
        this.port = port;
        this.emit('found_port', this);
        this._acceptNewConnection(callback);
      }
    };

    RemoteDevice.prototype._onFailedToListen = function(callback, port, result) {
      if (port - RemoteDevice.BASE_PORT > RemoteDevice.MAX_CONNECTION_ATTEMPTS) {
        this._log('w', "Couldn't listen to 0.0.0.0 on any attempted ports",
          chrome.runtime.lastError.message + " (error " +  (-result) + ")");
        this.port = RemoteDevice.NO_PORT;
        return this.emit('no_port');
      } else {
        return this._listenOnValidPort(callback, port + Math.floor(Math.random() * 100));
      }
    };

    RemoteDevice.prototype._acceptNewConnection = function(callback) {
      var _this = this;
      this._log('listening for new connections on port', this.port);
      // TODO(rpaquay): When do we remove the listener?
      chrome.sockets.tcpServer.onAccept.addListener(function(acceptInfo) {
        if (_this._socketId != acceptInfo.socketId)
          return;
        _this._onAccept(acceptInfo, callback);
      });
    };

    RemoteDevice.prototype._onAccept = function(acceptInfo, callback) {
      this._log('Connected to a client device', this._socketId);
      registerSocketConnection(acceptInfo.clientSocketId);
      var device = new RemoteDevice(acceptInfo.clientSocketId);
      device.getAddr(function() {
        return callback(device);
      });
    }

    /*
     * Called when acting as a server. Finds the client ip address.
     */

    RemoteDevice.prototype.getAddr = function(callback) {
      var _ref,
        _this = this;
      return (_ref = chrome.sockets.tcp) != null ? _ref.getInfo(this._socketId, function(socketInfo) {
        _this.addr = socketInfo.peerAddress;
        return callback();
      }) : void 0;
    };

    RemoteDevice.prototype.send = function(type, args) {
      var _this = this;
      if (args) {
        // Convert Uint8Arrays to regular JS arrays for stringify.
        // TODO(flackr): Preferably this would be done earlier so that send
        // doesn't need to know what's being sent.
        for (var i = 0; i < args.length; i++) {
          if (args[i] instanceof Uint8Array)
            args[i] = Array.prototype.slice.call(args[i]);
        }
      }
      var msg = JSON.stringify({
        type: type,
        args: args
      });
      msg = msg.length + '$' + msg;
      return irc.util.toSocketData(msg, function(data) {
        var _ref;
        return (_ref = chrome.sockets.tcp) != null ? _ref.send(_this._socketId, data, function(sendInfo) {
          if (sendInfo.resultCode < 0 || sendInfo.bytesSent !== data.byteLength) {
            _this._log('w', 'closing b/c failed to send:', type, args,
              chrome.runtime.lastError.message + " (error " + (-sendInfo.resultCode) + ")");
            return _this.close();
          } else {
            return _this._log('sent', type, args);
          }
        }) : void 0;
      });
    };

    /*
     * Called when the device represents a remote server. Creates a connection
     * to that remote server.
     */

    RemoteDevice.prototype.connect = function(callback) {
      var _ref,
        _this = this;
      this.close();
      return (_ref = chrome.sockets.tcp) != null ? _ref.create(function(socketInfo) {
        var _ref1;
        _this._socketId = socketInfo.socketId;
        _this._isClient = true;
        if (!_this._socketId) {
          callback(false);
        }
        _ref.setPaused(_this._socketId, true, function () {
          return (_ref1 = chrome.sockets.tcp) != null ? _ref1.connect(_this._socketId, _this.addr, _this.port, function (result) {
            return _this._onConnect(result, callback);
          }) : void 0;
        });
      }) : void 0;
    };

    RemoteDevice.prototype._onConnect = function(result, callback) {
      if (result < 0) {
        this._log('w', "Couldn't connect to server", this.addr, 'on port', this.port, '-',
          chrome.runtime.lastError.message + " (error " +  (-result) + ")");
        return callback(false);
      } else {
        this._listenForData();
        return callback(true);
      }
    };

    RemoteDevice.prototype.close = function() {
      var _ref, _ref1;
      if (this._socketId) {
        if (this._isClient) {
          chrome.sockets.tcp.onReceive.removeListener(this._onReceive);
          chrome.sockets.tcp.onReceiveError.removeListener(this._onReceiveError);
          registerSocketConnection(this._socketId, true);
          chrome.sockets.tcp.disconnect(this._socketId);
          chrome.sockets.tcp.close(this._socketId);
        } else {
          //chrome.sockets.tcp.onAccept.removeListener(this._onAccept);
          registerTcpServer(this._socketId, true);
          chrome.sockets.tcp.disconnect(this._socketId);
          chrome.sockets.tcp.close(this._socketId);
        }
        this._socketId = undefined;
        return this.emit('closed', this);
      }
    };

    RemoteDevice.prototype._onReceive = function (receiveInfo) {
      if (receiveInfo.socketId != this._socketId)
        return;

      var _this = this;
      irc.util.fromSocketData(receiveInfo.data, function (partialMessage) {
        var completeMessages, data, json, _i, _len, _results;
        _this._receivedMessages += partialMessage;
        completeMessages = _this._parseReceivedMessages();
        _results = [];
        for (_i = 0, _len = completeMessages.length; _i < _len; _i++) {
          data = completeMessages[_i];
          _this._log.apply(_this, ['received', data.type].concat(__slice.call(data.args)));
          _results.push(_this.emit.apply(_this, [data.type, _this].concat(__slice.call(data.args))));
        }
        return _results;
      });
    }

    RemoteDevice.prototype._onReceiveError = function (receiveInfo) {
      if (receiveInfo.socketId != this._socketId)
        return;

      this._log('w', 'bad read - closing socket: ', "(error " + (-receiveInfo.resultCode) + ")");
      this.emit('closed', this);
      this.close();
    }

    RemoteDevice.prototype._listenForData = function () {
      chrome.sockets.tcp.onReceive.addListener(this._onReceive);
      chrome.sockets.tcp.onReceiveError.addListener(this._onReceiveError);
      chrome.sockets.tcp.setPaused(this._socketId, false, function () { });
    };

    RemoteDevice.prototype._parseReceivedMessages = function(result) {
      var length, message, prefixEnd;
      if (result == null) {
        result = [];
      }
      if (!this._receivedMessages) {
        return result;
      }
      var isDigit = function(c) {
        return c >= '0' && c <= '9';
      };
      if (this._receivedMessages.length &&
          !isDigit(this._receivedMessages[0])) {
        this._log.apply(this, ['received message doesn\'t begin with digit: ', this._receivedMessages]);
      }
      prefixEnd = this._receivedMessages.indexOf('$');
      if (!(prefixEnd >= 0)) {
        return result;
      }
      length = parseInt(this._receivedMessages.slice(0, +(prefixEnd - 1) + 1 || 9e9));
      if (!(this._receivedMessages.length > prefixEnd + length)) {
        return result;
      }
      message = this._receivedMessages.slice(prefixEnd + 1, +(prefixEnd + length) + 1 || 9e9);
      try {
        var json = JSON.parse(message);
        result.push(json);
        if (JSON.stringify(json).length != length) {
          this._log('e', 'json length mismatch');
        }
      } catch (e) {
        this._log('e', 'failed to parse json: ' + message);
      }
      if (this._receivedMessages.length > prefixEnd + length + 1 &&
          !isDigit(this._receivedMessages[prefixEnd + length + 1])) {
        this._log('e', 'message after split doesn\'t begin with digit: ' + this._receivedMessages);
      }
      this._receivedMessages = this._receivedMessages.slice(prefixEnd + length + 1);
      return this._parseReceivedMessages(result);
    };

    RemoteDevice.prototype.toString = function() {
      if (this.addr) {
        return "" + this.addr + " on port " + this.port;
      } else {
        return "" + this.socketId;
      }
    };

    return RemoteDevice;

  })(EventEmitter);

  exports.RemoteDevice = RemoteDevice;

}).call(this);
