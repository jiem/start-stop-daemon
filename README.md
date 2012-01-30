# start-stop-daemon

An 1-function Node.js module to easily create native `child_process.fork` start-stop-daemon scripts.
Created daemons are self-monitored and restart automatically when crashing (a custom crash handler can be attached too).  

## Installation

    npm install start-stop-daemon


## Usage

    //file daemon.js    
    startStopDaemon([options], function() {
      //awesome code you want to daemonize
    });


* Start the daemon with the command `node daemon.js start`
* Stop the daemon with the command `node daemon.js stop`
* Restart the daemon with the command `node daemon.js restart`
* Get the status of the daemon with the command `node daemon.js status`
* Run the script not as a daemon with the command `node daemon.js run`
    
### Possible `options` fields:

* `pidFile`: the file to log the daemon PID. Default to `'daemon.pid'`.
* `outFile`: the file to log the daemon stdout. Default to `'daemon.out'`.
* `errFile`: the file to log the daemon crashes (uncaught exceptions). Default to `'daemon.err'`.
* `maxCrash`: the maximum number of crashes by minute. Past this number, the daemon exits. Default to `5`.
* `onStart`: listener fired when we start the daemon. Default to displaying a start message.
* `onStop`: listener fired when we stop the daemon. Default to displaying a stop message.
* `onStatus`: listener fired when we get the status of the daemon. Default to displaying a status message.
* `onCrash`: listener fired when the daemon crashes. Default to restarting the daemon.

The `options` default fields can be found in the `startStopDaemon.defaultOptions` object.

### Handling crashes (in the `onCrash` listener only):

Exit daemon:  

    startStopDaemon.cleanCrash('exit')

Restart the daemon, append stdout to the previous stdout file, append the crash error to the error file:

    startStopDaemon.cleanCrash('restart')


## Example 1: `server.js`, a stupid web server daemon

    var startStopDaemon = require('start-stop-daemon');
    var http = require('http');

    startStopDaemon(function() {
      http.createServer(function(req, res) {
        console.log(req.connection.remoteAddress + ' at ' + new Date());
        res.end(new Date() + ': Hello world');
      }).listen(8080);
    });

Execute the command `node server.js start`  
Play with the server in your browser on http://localhost:8080  
Execute the command `node server.js status`  
Execute the command `node server.js stop`  
Check the stdout file `server.out`.

## Example 2: `crasher.js`, a timer daemon that crashes every second

    var startStopDaemon = require('start-stop-daemon');

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

Execute the command `node crasher.js start`  
Wait 4 seconds then execute the command `node crasher.js status` to check that the daemon correctly exited  
Check the stdout file `customStdoutFile.log` and the error file `customErrorFile.log`.     
    

# MIT License 

Copyright (c) 2012 Jie Meng-Gerard <contact@jie.fr>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.