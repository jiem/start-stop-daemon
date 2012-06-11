var startStopDaemon = require('..');

var options = {
  
  outFile: 'customOutFile.log',   
  errFile: 'customErrFile.log',
  
  onCrash: function(e) {  
    // Logging crash in sdtout file    
    console.log('CRASH');
    // Restart daemon if it crashes during the 3 first seconds, exit it otherwise
    Date.now() - this.startTime <= 3000 ?
      this.crashRestart() :
      this.crashExit();
  }
 
};

startStopDaemon(options, function() {
  var count = 0;
  setInterval(function() {
    if (count >= 5)
      throw new Error('to crash the timer');    
    console.log('0.' + 2 * count++ + ' second');             
  }, 200);      
});
