var fs = require('fs');
var path = require('path');
var util = require('util');
var events = require('events');
var child_process = require('child_process');

var SCRIPT_NAME = path.basename(process.argv[1]);

//==============================================================================
function startStopDaemon(options, action) {  
  
  var daemon = new StartStopDaemon(options, action);  
  
  switch (process.argv[2]) {
    case 'run': daemon.action(); break;
    case 'start': _start(daemon); break;
    case 'stop': _stop(daemon); break;
    case 'restart': _restart(daemon); break;
    case 'status': _status(daemon); break;    
    case 'monitor': _monitor(daemon); break;
    case 'runner': _runner(daemon); break;
    case 'runnerA': _runner(daemon, true); break;      
    default:
      console.log('\033[31m'
        + 'Usage: node ' + SCRIPT_NAME  + ' {start|stop|restart|status|run}\n'
        + 'Options:\n'
        + '  --logAppend              append to existing stdout/stderr files\n'
        + '  --daemon <daemonFile>    specify daemon file for PID, startTime...\n'
        + '  --out <stdoutFile>       specify stdout file\n'
        + '  --err <stderrFile>       specify stderr file\n'
        + '  --max-crash <value>      specify maximum number of crashes by minute'
        + '  --crash-timeout <value>  specify a crash timeout in ms before restarting'
        + '\033[39m');
  }
  
}

//==============================================================================
function StartStopDaemon(options, action) {
    
  var argv = process.argv;
  var daemonName = /(.+)\.js$/.test(SCRIPT_NAME) ? RegExp.$1 : SCRIPT_NAME;
  var i;

  if (typeof options === 'function') {
    action = options;
    options = null;
  }

  if (typeof action !== 'function')
    throw new TypeError('invalid arguments');     
  
  events.EventEmitter.call(this);
  
  options || (options = {});
  this.daemonFile = (i = argv.indexOf('--max-crash') + 1) ?
    argv[i] : (options.daemonFile || daemonName + '.dmn');
  this.outFile = (i = argv.indexOf('--out') + 1) ?
    argv[i] : (options.outFile || daemonName + '.out');
  this.errFile = (i = argv.indexOf('--err') + 1) ?
    argv[i] : (options.errFile || daemonName + '.err');
  this.maxCrash = (i = argv.indexOf('--max-crash') + 1) ?
    parseInt(argv[i]) : (options.maxCrash || 5);
  this.crashTimeout = (i = argv.indexOf('--crash-timeout') + 1) ?
    parseInt(argv[i]) : options.crashTimeout;
  this.logAppend = argv.indexOf('--logAppend') !== -1 || options.logAppend; 
  
  this.action = action;
  this.crashDates = [];
  
  this.on('start', options.onStart || startStopDaemon.defaultOnStart);
  this.on('stop', options.onStop || startStopDaemon.defaultOnStop);
  this.on('status', options.onStatus || startStopDaemon.defaultOnStatus);
  this.on('crash', options.onCrash || startStopDaemon.defaultOnCrash);
  
  _loadDaemonFile(this);
  
}

util.inherits(StartStopDaemon, events.EventEmitter);

//==============================================================================
StartStopDaemon.prototype.crashExit = function() {  
  process.kill(this.monitorPID, 'SIGKILL');
  fs.unlinkSync(this.daemonFile);
  _finalizeIOAndExitRunner(this);
}

//==============================================================================
StartStopDaemon.prototype.crashRestart = function(logAppend) {  
  process.send({status: 'restart', logAppend: logAppend !== false});
  _finalizeIOAndExitRunner(this);
}

//==============================================================================
function _start(self) {  
  if (self.monitorPID) {
    isProcessRunning(self.monitorPID, function(isRunning) {
      isRunning ?
        self.emit('start', {status: 'daemonAlreadyRunning'}) :    
        _starter(self);      
    });
  } else {
    _starter(self);
  }
}

//==============================================================================
function _stop(self) {  
  if (self.monitorPID) {
    isProcessRunning(self.monitorPID, function(isRunning) {
      if (isRunning) {
        try {                    
          process.kill(self.monitorPID, 'SIGKILL');          
          process.kill(self.runnerPID, 'SIGKILL');
          fs.unlinkSync(self.daemonFile);
          self.emit('stop', {status: 'stopDaemonSuccessfull'});
        } catch (e) {
          self.emit('stop', {status: 'stopDaemonNotAuthorized', error: e});
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
  if (self.monitorPID) {
    isProcessRunning(self.monitorPID, function(isRunning) {
      if (isRunning) { 
        try {          
          process.kill(self.monitorPID, 'SIGKILL');
          process.kill(self.runnerPID, 'SIGKILL');
        } catch (e) {
          self.emit('stop', {status: 'stopDaemonNotAuthorized', error: e});
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
  if (self.monitorPID) {        
    isProcessRunning(self.monitorPID, function(isRunning) {
      var runningTime, days, hours, minutes, seconds;
      if (isRunning) {
        runningTime = Date.now() - self.startTime;
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
        self.emit('status', {
          status: 'daemonRunning', 
          pid: self.monitorPID, 
          runningTime: runningTime
        });
      } else {
        self.emit('status', {status: 'daemonNotRunning'});
      }
    });      
  } else {
    self.emit('status', {status: 'daemonNotRunning'});
  }
}

//==============================================================================
function _starter(self) {  
  process.argv[2] = 'monitor';    
  var options = {env: process.env, setsid: true};  
  var child = child_process.spawn(process.argv.shift(), process.argv, options);
  self.emit('start', child ?
    {status: 'daemonForkSuccessful', pid: child.pid} :
    {status: 'daemonForkUnsuccessful'}
  );  
  process.exit(0);
}

//==============================================================================
function _monitor(self) {

  var argv = process.argv;
  var script = argv[1];
  var runner;

  function fork() {        
    runner = child_process.fork(script, argv, {env: process.env, setsid: true});               
    if (runner) {
      self.runnerPID = runner.pid;
      _saveDaemonFile(self);
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
            argv[0] = m.logAppend && argv.indexOf('--logAppend') === -1 ?
                'runnerA' : 'runner';
            self.crashTimeout ?
              setTimeout(fork, self.crashTimeout) :
              fork();            
          } else {
            killRunner();
            process.exit(1);
          }
        } else {
          killRunner();
          process.exit(0);
        }
      });    
    } else {
      killRunner();
      process.exit(1);
    }
  } 
  
  function killRunner() {
    if (runner)
      try {process.kill(runner.pid, 'SIGKILL')} catch (e) {}         
    try {fs.unlinkSync(self.daemonFile);} catch (e) {}
  }
  
  process.on('SIGTERM', killRunner);
  process.on('SIGINT', killRunner);
  process.on('SIGKILL', killRunner);
  
  argv.splice(0, 2);  
  argv[0] = 'runner';  
  self.monitorPID = process.pid;      
  self.startTime = Date.now();  
  fork();  
  
}

//==============================================================================
function _runner(self, logAppend) {
  
  var options = {encoding: 'utf8', flags: logAppend || self.logAppend ? 'a+' : 'w+'};
  var stdout = self.stdout = fs.createWriteStream(self.outFile, options);
  var stderr = self.stderr = (self.errFile === self.outFile) ?
    stdout : fs.createWriteStream(self.errFile, options);
  
  process.stdout.write = function(x) {
    stdout._hasPendingData = !stdout.write(x);
  }
  process.stderr.write = function(x) {
    stderr._hasPendingData = !stderr.write(x);
  }
  process.on('uncaughtException', function(e) {      
    stderr._hasPendingData = !stderr.write(new Date().toString() + ':\n' + e.stack + '\n\n');
    self.emit('crash', e);    
  });  

  self.action();

}

//==============================================================================
function _finalizeIOAndExitRunner(self) {
  var wait = 0; 
  if (self.stdout._hasPendingData) {
    self.stdout.on('drain', function() {
      self.stdout.end();
      if (!--wait)
        process.exit(0);
    });
    wait++;
  }
  if (self.stderr !== self.stdout && self.stderr._hasPendingData) {
    self.stderr.on('drain', function() {
      self.stderr.end();
      if (!--wait)
        process.exit(0);
    });
    wait++;
  }
  if (!wait)
    process.exit(0);
}

//==============================================================================
function _saveDaemonFile(self) {
  fs.writeFileSync(self.daemonFile,
    '{\n' +
    '  "monitorPID": ' + self.monitorPID + ',\n' + 
    '  "runnerPID": ' + self.runnerPID + ',\n' +
    '  "startTime": ' + self.startTime + '\n' +
    '}'
  );
}

//==============================================================================
function _loadDaemonFile(self) {
  var daemon;  
  if ((fs.existsSync || path.existsSync)(self.daemonFile)) {
    daemon = JSON.parse(fs.readFileSync(self.daemonFile, 'utf8'));
    self.monitorPID = daemon.monitorPID;
    self.runnerPID = daemon.runnerPID;
    self.startTime = daemon.startTime;
  }
}

//==============================================================================
startStopDaemon.defaultOnStart = function(event) {
  if (event.status === 'daemonAlreadyRunning')
    console.log('\033[31m' + SCRIPT_NAME + ' daemon already running\033[39m');
  else if (event.status === 'daemonForkedUnsuccessfully')
    console.log('\033[31m' + SCRIPT_NAME + ' daemon could not start: forking error\033[39m');
  else
    console.log('\033[32m' + SCRIPT_NAME + ' daemon successfully started with pid ' + event.pid + '\033[0m');
}

//==============================================================================
startStopDaemon.defaultOnStop = function(event) {
  if (event.status === 'daemonNotRunning') {
    console.log('\033[31m' + SCRIPT_NAME + ' daemon not running\033[39m');
  } else if (event.status === 'stopDaemonNotAuthorized') {
    console.log('\033[31m' + SCRIPT_NAME + ' daemon could not be stopped, you may not be authorized (sudo?)\033[39m');
  } else {
    console.log('\033[32m' + SCRIPT_NAME + ' daemon successfully stopped\033[0m');
  }
}

//==============================================================================
startStopDaemon.defaultOnStatus = function(event) {
  event.status === 'daemonNotRunning' ?
    console.log('\033[31m' + SCRIPT_NAME + ' daemon not running\033[39m') :
    console.log('\033[32m' + SCRIPT_NAME + ' daemon running since '
        + event.runningTime + ' with pid ' + event.pid + '\033[0m');
}

//==============================================================================
startStopDaemon.defaultOnCrash = function() {
  this.crashRestart();  
}

//==============================================================================
function isProcessRunning(pid, callback) {
  child_process.exec('ps ' + pid + ' | grep -v PID', function(err, stdout) {
    callback(!err && stdout.indexOf(pid) !== -1);
  });
}

//==============================================================================
module.exports = startStopDaemon;