var startStopDaemon = require('..');
var http = require('http');
var fs = require('fs');

startStopDaemon(function() {  
  
  http.createServer(function(req, res) {           
    console.log(req.connection.remoteAddress + ' accessed ' + req.url);
    if (req.url === '/error') 
      throw new Error('to crash server');        
    res.end('Hello world! Thanks for accessing ' + req.url);        
  }).listen(1095);    
  
})

.on('restart', function() { //event handler triggered when the server restarts 
  this.stdout.write('Restarting at ' + new Date() + '\n'); //use this.stdout.write to write in outFile, not console.log
});