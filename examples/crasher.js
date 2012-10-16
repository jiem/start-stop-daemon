var startStopDaemon = require('..');

var options = {
  outFile: 'customOutFile.log',   
  errFile: 'customErrFile.log',
  max: 3 //the script will run 3 times at most
};

startStopDaemon(options, function() {
  var count = 0;
  setInterval(function() {
    console.log(++count * 200 + 'ms');
    if (count >= 5) {
      console.log('timer crashing after 1 second\n');
      throw new Error('to crash timer');                       
    }
  }, 200);      
});