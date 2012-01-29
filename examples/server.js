var startStopDaemon = require('..');
var http = require('http');

startStopDaemon(function() {
  http.createServer(function(req, res) {
    console.log(req.connection.remoteAddress + ' at ' + new Date());
    res.end(new Date() + ': Hello world');
  }).listen(8080);
});