var startStopDaemon = require('..');
var http = require('http');

var HELLO_WORLD = []; 

startStopDaemon(function() {
  http.createServer(function(req, res) {   
    console.log(req.connection.remoteAddress + ' accessed ' + req.url);
    HELLO_WORLD.push('Hello world! Welcome to our fantastic page ' + req.url);
    res.end(HELLO_WORLD.join('\n'));
  }).listen(8080);
});