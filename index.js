var fs = require('fs');
var path = require('path');
var util = require('util');
var events = require('events');
var child_process = require('child_process');

var SCRIPT_NAME = path.basename(process.argv[1]);
var IN_RUNNER, STDOUT_STREAM, ERROR_STREAM;

//==============================================================================
function startStopDaemon(options, action) {

  var argv = process.argv;
  var daemon, i;

  if (typeof options === 'function') {
    action = options;
    options = null;
  }

  if (!options)
    options = {};

  if (typeof action !== 'function')
    throw new TypeError('invalid arguments');

  if ((i = argv.indexOf('--max-crash') + 1))
    (options.maxCrash = parseInt(argv[i]));
  if ((i = argv.indexOf('--pid') + 1))
    (options.pidFile = argv[i]);  
  if ((i = argv.indexOf('--out') + 1))
    (options.outFile = argv[i]) && (options.commandLineOut = true);
  if ((i = argv.indexOf('--err') + 1))
    (options.errFile = argv[i]) && (options.commandLineErr = true);
  options.logAppend = argv.indexOf('--logAppend') !== -1;

  daemon = new StartStopDaemon(options, action);

  switch (argv[2]) {
    case 'start':
      _start(daemon);
      break;
    case 'stop':
      _stop(daemon);
      break;
    case 'restart':
      _restart(daemon);
      break;
    case 'status':
      _status(daemon);
      break;
    case '--monitor':
      _monitor(daemon);
      break;
    case '--runner':
      argv.splice(2,1); // removes the --runner argument from argv
      _runner(daemon);
      break;
    case 'run':
      action();
      break;
    default:
      console.log('\033[31m'
        + 'Usage: node ' + SCRIPT_NAME  + ' {run|start|stop|restart|status}\n'
        + 'Options:\n'
        + '  --logAppend           append to existing stdout and stderr files\n'
        + '  --pid <pidFile>       specify pid file\n'
        + '  --out <stdoutFile>    specify stdout file\n'
        + '  --err <stderrFile>    specify stderr file\n'
        + '  --max-crash <value>   specify maximum number of crashes by minute'
        + '\033[39m');
  }

}

//==============================================================================
(function() {  
  var match = SCRIPT_NAME.match(/(.*)\.js$/);
  var name = match ? match[1] : SCRIPT_NAME;
  startStopDaemon.defaultOptions = {
    pidFile: name + '.pid',
    outFile: name + '.out',
    errFile: name + '.err',
    maxCrash: 5
  };
})();

//==============================================================================
startStopDaemon.defaultOptions.onStart = function(event) {
  if (event.status === 'daemonAlreadyRunning')
    console.log('\033[31m' + SCRIPT_NAME + ' daemon already running\033[39m');
  else if (event.status === 'daemonForkedUnsuccessfully')
    console.log('\033[31m' + SCRIPT_NAME + ' daemon could not start: forking error\033[39m');
  else
    console.log('\033[32m' + SCRIPT_NAME + ' daemon successfully started with pid ' + event.pid + '\033[0m');
}

//==============================================================================
startStopDaemon.defaultOptions.onStop = function(event) {
  if (event.status === 'daemonNotRunning') {
    console.log('\033[31m' + SCRIPT_NAME + ' daemon not running\033[39m');
  } else if (event.status === 'stopDaemonNotAuthorized') {
    console.log('\033[31m' + SCRIPT_NAME + ' daemon could not be stopped, you may not be authorized (sudo?)\033[39m');
  } else {
    console.log('\033[32m' + SCRIPT_NAME + ' daemon successfully stopped\033[0m');
  }
}

//==============================================================================
startStopDaemon.defaultOptions.onStatus = function(event) {
  event.status === 'daemonNotRunning' ?
    console.log('\033[31m' + SCRIPT_NAME + ' daemon not running\033[39m') :
    console.log('\033[32m' + SCRIPT_NAME + ' daemon running since '
        + event.runningTime + ' with pid ' + event.pid + '\033[0m');
}

//==============================================================================
startStopDaemon.defaultOptions.onCrash = function(event) {
  startStopDaemon.cleanCrash('restart');
}

//==============================================================================
startStopDaemon.cleanCrash = function(exitOrRestart) {
  var wait = 0;
  if (IN_RUNNER) {
    process.send({status: exitOrRestart === 'exit' ? 'exit' : 'restart'});  
    if (STDOUT_STREAM._hasPendingData) {
      STDOUT_STREAM.on('drain', function() {
        STDOUT_STREAM.end();
        if (!--wait)
          process.exit(0);
      });
      wait++;
    }
    if (ERROR_STREAM !== STDOUT_STREAM && ERROR_STREAM._hasPendingData) {
      ERROR_STREAM.on('drain', function() {
        ERROR_STREAM.end();
        if (!--wait)
          process.exit(0);
      });
      wait++;
    }
    if (!wait)
      process.exit(0);
  }  
}

//==============================================================================
function StartStopDaemon(options, action) {
  var defaultOptions = startStopDaemon.defaultOptions;
  events.EventEmitter.call(this);
  this.pidFile = options.pidFile || defaultOptions.pidFile;
  this.outFile = options.outFile || defaultOptions.outFile;
  this.errFile = options.errFile || defaultOptions.errFile;
  this.maxCrash = options.maxCrash || defaultOptions.maxCrash;
  this.commandLineOut = options.commandLineOut;
  this.commandLineErr = options.commandLineErr;
  this.logAppend = options.logAppend;
  this.action = action;
  this.crashDates = [];
  this.on('start', options.onStart || defaultOptions.onStart);
  this.on('stop', options.onStop || defaultOptions.onStop);
  this.on('status', options.onStatus || defaultOptions.onStatus);
  this.on('crash', options.onCrash || defaultOptions.onCrash);
}

util.inherits(StartStopDaemon, events.EventEmitter);

//==============================================================================
function _start(self) {
  var pid;
  if (path.existsSync(self.pidFile))
    pid = fs.readFileSync(self.pidFile, 'utf8').split('|')[0];
  if (pid) {
    isProcessRunning(pid, function(isRunning) {
      if (isRunning) {
        self.emit('start', {status: 'daemonAlreadyRunning'});
      } else {
        _starter(self);
      }
    });
  } else {
    _starter(self);
  }
}

//==============================================================================
function _stop(self) {
  var pid;
  if (path.existsSync(self.pidFile))
    pid = fs.readFileSync(self.pidFile, 'utf8').split('|')[0];
  if (pid) {
    isProcessRunning(pid, function(isRunning) {
      if (isRunning) {
        try {          
          process.kill(pid);
          fs.unlinkSync(self.pidFile);
          self.emit('stop', {status: 'stopDaemonSuccessfull'});
        } catch (e) {
          self.emit('stop', {status: 'stopDaemonNotAuthorized'});
        }
      } else {
        self.emit('stop', {status: 'daemonNotRunning'});
      }
    });
  } else {
    self.emit('stop', {status: 'daemonNotRunning'});
  }
}

//==============================================================================
function _restart(self) {
  var pid;
  if (path.existsSync(self.pidFile))
    pid = fs.readFileSync(self.pidFile, 'utf8').split('|')[0];
  if (pid) {
    isProcessRunning(pid, function(isRunning) {
      if (isRunning) { 
        try {          
          process.kill(pid);
        } catch (e) {
          self.emit('stop', {status: 'stopDaemonNotAuthorized'});
          return;
        }
        self.emit('stop', {status: 'stopDaemonSuccessfull'});        
        _start(self);
      } else {
        _start(self);
      }
    });
  } else {
    _start(self);
  }
}

//==============================================================================
function _status(self) {
  var split, pid, runningTime, days, hours, minutes, seconds;
  if (path.existsSync(self.pidFile)) {
    split = fs.readFileSync(self.pidFile, 'utf8').split('|');
    pid = split[0];
    runningTime = Date.now() - parseInt(split[1]);
    days = Math.floor(runningTime / 86400000);
    runningTime %= 86400000;
    hours = Math.floor(runningTime / 3600000);
    runningTime %= 3600000;
    minutes = Math.floor(runningTime / 60000);
    runningTime %= 60000;
    seconds = Math.ceil(runningTime / 1000);
    runningTime = '';
    if (days)
      runningTime += days + (days > 1 ? ' days ' : ' day ');
    if (hours)
      runningTime += hours + (hours > 1 ? ' hours ' : ' hour ');
    if (minutes)
      runningTime += minutes + (minutes > 1 ? ' minutes ' : ' minute ');
    runningTime += seconds + (seconds > 1 ? ' seconds' : ' second');
  }
  if (pid) {
    isProcessRunning(pid, function(isRunning) {
      self.emit('status', isRunning ?
        {status: 'daemonRunning', pid: pid, runningTime: runningTime} :
        {status: 'daemonNotRunning'}
      );
    });
  } else {
    self.emit('status', {status: 'daemonNotRunning'});
  }
}

//==============================================================================
function _starter(self) {
  var command = process.argv.shift();
  var startTime = Date.now();
  var child;
  self.commandLineOut || process.argv.push('--out', self.outFile);
  self.commandLineErr || process.argv.push('--err', self.errFile);
  process.argv[1] = '--monitor';
  process.argv.push(startTime);
  child = child_process.spawn(command, process.argv, {env: process.env, setsid: true});
  if (child) {
    fs.writeFileSync(self.pidFile, child.pid + '|' + startTime);
    self.emit('start', {status: 'daemonForkSuccessful', pid: child.pid});    
  } else {
    self.emit('start', {status: 'daemonForkUnsuccessful'});
  }
  process.exit(0);
}

//==============================================================================
function _monitor(self) {

  var script = process.argv[1];
  var runner;

  function fork() {
    runner = child_process.fork(script, process.argv, {env: process.env, setsid: true});
    if (process.argv.indexOf('--logAppend') === -1)
      process.argv.splice(process.argv.length - 1, 0, '--logAppend');
    if (runner) {
      runner.on('message', function(m) {
        var currentDate, i;
        if (m.status === 'restart') {
          currentDate = new Date();
          for (i = self.crashDates.length - 1; i >= 0; i--) {
            if (currentDate - self.crashDates[i] > 60000)
              self.crashDates.pop();
          }
          if (self.crashDates.length < self.maxCrash) {
            self.crashDates.unshift(currentDate);
            fork();
          } else {
            try {fs.unlinkSync(self.pidFile);} catch (e) {}
            process.exit(1);
          }
        } else {
          try {fs.unlinkSync(self.pidFile);} catch (e) {}
          process.exit(0);
        }
      });    
    } else {
      try {fs.unlinkSync(self.pidFile);} catch (e) {}
      process.exit(1);
    }
  }
  
  process.on('SIGTERM', function() {
    if (runner)
      try {process.kill(runner.pid);} catch (e) {}      
    process.exit(0);
  });
  process.argv.splice(0, 2);  
  process.argv[0] = '--runner';
      
  fork();
  
}

//==============================================================================
function _runner(self) {
  
  var startTime = parseInt(process.argv.pop()); 
  var options = {encoding: 'utf8', flags: self.logAppend ? 'a+' : 'w+'};
  var stdoutStream = STDOUT_STREAM = fs.createWriteStream(self.outFile, options);
  var errorStream = ERROR_STREAM = self.errFile === self.outFile ?
    stdoutStream :
    fs.createWriteStream(self.errFile, options);

  IN_RUNNER = true;

  process.stdout.write = function(x) {
    stdoutStream._hasPendingData = !stdoutStream.write(x);
  }
  process.stderr.write = function(x) {
    errorStream._hasPendingData = !errorStream.write(x);
  }
  process.on('uncaughtException', function(e) {      
    errorStream._hasPendingData = !errorStream.write(new Date().toString() + ':\n' + e.stack + '\n\n');
    self.emit('crash', e);    
  });
  process.on('SIGTERM', function() {
    process.send({status: 'exit'});
    process.exit(0);
  });

  self.startDate = new Date(startTime);
  self.action();

}

//==============================================================================
function isProcessRunning(pid, callback) {
  child_process.exec('ps ' + pid + ' | grep -v PID', function(err, stdout) {
    callback(!err && stdout.indexOf(pid) !== -1);
  });
}

//==============================================================================
module.exports = startStopDaemon;
