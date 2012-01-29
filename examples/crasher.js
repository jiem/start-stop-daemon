var startStopDaemon = require('..');

var options = {
  outFile: 'customStdoutFile.log', 
  errFile: 'customErrorFile.log'
};

options.onCrash = function(e) {

  // Your own code to handle the crash: a mail notification for example
  //....

  // Log the crash in the stdout file
  console.log('CRASH');

  // Restart the daemon if it crashes during the 3 first seconds, exit the daemon otherwise
  new Date() - this.startDate <= 3000 ?
    startStopDaemon.cleanCrash('restart') :
    startStopDaemon.cleanCrash('exit');

 }

startStopDaemon(options, function() {
  var count = 0;
  setInterval(function() {
    if (count >= 5)
      throw new Error('to crash the timer');    
    console.log('0.' + 2 * count++ + ' second');             
  }, 200);      
});