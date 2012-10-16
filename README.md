# start-stop-daemon

Easily transform a JS script into a start-stop-daemon script.

## Installation

    npm install start-stop-daemon

## Usage

    //file script.js    
    startStopDaemon([options], function() {
      //awesome code you want to daemonize
    });

* Start your script as a daemon with the command `node script.js start`
* Stop the daemon with the command `node script.js stop`
* Restart the daemon with the command `node script.js restart`
* Get the status of the daemon with the command `node script.js status`
* Run the script normally (not as a daemon) with the command `node script.js`
    
## Options

* `outFile`: the file to log the daemon stdout. Default to `'out.log'`.
* `errFile`: the file to log the daemon stderr. Default to `'err.log'`.
* `max`: the max number of times the script should run. Default to `5`.
* ...

More options documented on the [forever-monitor page][0].  
Options can also be passed from the command-line: `node script.js start --outFile custom.log` (more details [here][1]).

## Events

Available events: `'error'`, `'start'`, `'stop'`, `'restart'`, `'exit'`, `'stdout'`, `'stderr'` (more details [here][2]).  
Use the `on` method to add a listener:

    startStopDaemon(function() {
      //code to daemonize
    }).on(event, listener);  

**Note:** In previous versions (<= 0.1.0), daemon's unexpected crashes were handled by the option `onCrash`.  
The same behavior can now be obtained by using the event `'restart'`. See the example below.


## Example 1: `server.js`, a simple http server daemon

``` js
  var startStopDaemon = require('start-stop-daemon');
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
```

* Start the server as a daemon with `node server.js start`  
* Test the server in the browser at *http://localhost:1095*  
* Make the server crash by going to *http://localhost:1095/error*  
* Go back to *http://localhost:1095* to check that the server restarted correctly after the crash    
* Get the server's status with `node server.js status`    
* Stop the server with `node server.js stop`    
* Check the stdout file `out.log`    

## Example 2: `crasher.js`, a timer daemon that crashes every second

``` js
  var startStopDaemon = require('start-stop-daemon');

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
```

* Start the timer as a daemon with `node crasher.js start`  
* Wait 4 seconds then get the timer's status with `node crasher.js status` to check that the daemon correctly exited  
* Check the log files `customOutFile.log` and `customErrFile.log`.     
    
## Implementation

As of version 0.1.0, daemons are handled by the [forever][3] module.
This refactoring makes `start-stop-daemon` much more robust than with my previous implementation.
Backward compatibility (versions <= 0.1.0) is ensured for the options except for the events (`onStart`, `onCrash`, ...)
which are now handled through an `EventEmitter` with a proper `on` method ([more here][2]).
Command-line options are not backward compatible since they are now merged with the forever ones ([more here][1]).


## MIT License 

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


[0]: https://github.com/nodejitsu/forever-monitor#options-available-when-using-forever-in-nodejs
[1]: https://github.com/nodejitsu/forever#using-forever-from-the-command-line
[2]: https://github.com/nodejitsu/forever-monitor#events-available-when-using-an-instance-of-forever-in-nodejs
[3]: https://github.com/nodejitsu/forever