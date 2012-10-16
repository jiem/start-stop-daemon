var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var child_process = require('child_process');
var forever = require('forever');

//==============================================================================
var DEFAULT_OPTIONS = {
  outFile: 'out.log',
  errFile: 'err.log',
  max: 5
};

var SCRIPT = path.basename(process.argv[1], '.js') + '.js';
var SCRIPT_PATH = path.join(path.dirname(process.argv[1]), SCRIPT);
var MONITOR_PATH = path.resolve(__dirname, 'monitor.js');

//==============================================================================
module.exports = function(options, action) {
  
  var fakeMonitor = {on: function() {return fakeMonitor;}};
  
  if (process.monitor)
    return process.monitor;
  
  if (typeof options === 'function') {
    action = options;
    options = DEFAULT_OPTIONS;
  }
  
  initOptions(options);
  
  switch (process.argv[2]) {    
    case 'start': start(options); break;
    case 'restart': restart(options); break;
    case 'stop': stop(); break;
    case 'status': status(); break;
    default: action();        
  }
  
  return fakeMonitor;
  
}

//==============================================================================
function start(options) {  
  getDaemonMeta(function(meta) {
    meta ?
      console.log('\033[31m' + SCRIPT + ' daemon already running\033[39m') :
      startDaemon(options);    
  });
}

//==============================================================================
function stop() {  
  forever.stop(SCRIPT_PATH)
    .on('stop', function(scripts) {
      fs.unlinkSync(scripts[0].pidFile);
      console.log('\033[32m' + SCRIPT + ' daemon successfully stopped\033[0m');
    })
    .on('error', function() {
      console.log('\033[31m' + SCRIPT + ' daemon not running or user not authorized to stop process\033[39m');
    });      
}

//==============================================================================
function restart(options) {
  getDaemonMeta(function(meta) {
    if (meta) {
      forever.stop(SCRIPT_PATH)
        .on('stop', function() {
          console.log('\033[32m' + SCRIPT + ' daemon successfully stopped\033[0m');
          startDaemon(options);
        });
    } else {
      startDaemon(options);      
    }
  });  
}

//==============================================================================
function status() { 
  getDaemonMeta(function(meta) {
    var log, match, nbRestarts;
    if (meta) {
      log = fs.readFileSync(meta.logFile, 'utf8');
      match = log.match(/restarting script for \d+ time/g);
      nbRestarts = match ? match.length : 0;
      console.log('\033[32m' + SCRIPT + ' daemon running since ' + new Date(meta.ctime) + '\033[0m');      
      if (nbRestarts)
        console.log('\033[31mwarning: daemon restarted ' + nbRestarts + (nbRestarts > 1 ? ' times' : ' time') + '\033[39m');
    } else {
      console.log('\033[31m' + SCRIPT + ' daemon not running or user not authorized to see process\033[39m');    
    }
  });
}

//==============================================================================
// almost same function as forever.startDaemon (different monitorPath & options)
function startDaemon(options) {  
  
  var monitor, outFD, errFD;  
  
  options.uid = options.uid || crypto.randomBytes(3).toString('base64').replace(/[\+\/]/g, '_');
  options.logFile = forever.logFilePath(options.logFile || options.uid + '.log');
  options.pidFile = forever.pidFilePath(options.pidFile || options.uid + '.pid');
  options.options = process.argv;
  
  outFD = fs.openSync(options.logFile, 'a');
  errFD = fs.openSync(options.logFile, 'a');
  
  process.argv[2] = 'run';
  process.argv.splice(0, 2);

  monitor = child_process.spawn(process.execPath, [MONITOR_PATH, SCRIPT_PATH], {
    stdio: ['ipc', outFD, errFD],
    detached: true
  });
  monitor.on('exit', function (code) {
    console.error('Monitor died unexpectedly with exit code %d', code);
  });
  monitor.send(JSON.stringify(options));
  monitor.unref();  
  
  console.log('\033[32m' + SCRIPT + ' daemon successfully started\033[0m');
  
}

//==============================================================================
function getDaemonMeta(cb) {
  forever.list(false, function(err, list) {
    if (list) {
      for (var i = 0, meta; meta = list[i]; i++) {
        if (meta.file === SCRIPT_PATH) {
          cb(meta);
          return;
        }
      }  
    }    
    cb(null);
  });
}

//==============================================================================
function initOptions(options) {
  if (options.maxCrash) {
    options.max = options.maxCrash;
    delete options.maxCrash;
  }
  if (options.daemonFile) {
    options.pidFile = options.daemonFile;
    delete options.daemonFile;
  }
  if (options.crashTimeout) {
    options.spinSleepTime = options.crashTimeout;
    delete options.crashTimeout;
  }
  if (options.logAppend) {
    options.append = options.logAppend;
    delete options.logAppend;
  }  
  options.pidFile && (options.pidFile = path.resolve(options.pidFile));
  options.outFile && (options.outFile = path.resolve(options.outFile));
  options.errFile && (options.errFile = path.resolve(options.errFile));
  options.logFile && (options.logFile = path.resolve(options.logFile));
}