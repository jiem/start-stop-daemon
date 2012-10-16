var startStopDaemon = require('..');
var http = require('http');

startStopDaemon(function() {    
  http.createServer(function(req, res) {           
    console.log(req.connection.remoteAddress + ' accessed ' + req.url);
    if (req.url === '/error') 
      throw new Error('to crash server');        
    res.end('Hello world! Thanks for accessing ' + req.url);        
  }).listen(1095);      
})

.on('restart', function() {
  //use this.stdout.write to write in the stdout log file, not console.log
  this.stdout.write('Restarting at ' + new Date() + '\n'); 
});