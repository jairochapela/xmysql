#! /usr/bin/env node

const morgan = require('morgan');
const bodyParser = require('body-parser');
const express = require('express');
const sqlConfig = require('commander');
const mysql = require('mysql');
const cors = require('cors');
const dataHelp = require('./lib/util/data.helper.js');
const Xapi = require('./lib/xapi.js');
const cmdargs = require('./lib/util/cmd.helper.js');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const { version } = require('./package.json');

const jwt = require('express-jwt');
const jsonwebtoken = require('jsonwebtoken');

function startXmysql(sqlConfig) {
  /**************** START : setup express ****************/
  let app = express();
  app.set('version', version);
  app.use(morgan('tiny'));
  app.use(cors());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({
    extended: true
  }));

  /**************** END : setup express ****************/


  /**************** START : setup mysql ****************/
  let mysqlPool = mysql.createPool(sqlConfig);
  /**************** END : setup mysql ****************/


  /**************** START : setup Xapi ****************/
  console.log('');
  console.log('');
  console.log('');
  console.log('          Generating REST APIs at the speed of your thought.. ');
  console.log('');

  let t = process.hrtime();
  let moreApis = new Xapi(sqlConfig, mysqlPool, app);

  moreApis.init((err, results) => {

    app.listen(sqlConfig.portNumber, sqlConfig.ipAddress);
    var t1 = process.hrtime(t);
    var t2 = t1[0] + t1[1] / 1000000000;


    console.log("          Xmysql took           :    %d seconds", dataHelp.round(t2, 1));
    console.log("          API's base URL        :    " + "localhost:" + sqlConfig.portNumber);
    console.log('                                                            ');
    console.log(' - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ');

  });
  /**************** END : setup Xapi ****************/


  /* Auth setup */
  if (process.env.JWT_SECRET) {

    app.use(jwt({ 
      secret: process.env.JWT_SECRET,
      credentialsRequired: true
    }).unless({path: ['/token']}));

    app.use(function (err, req, res, next) {
      if (req.headers['x-master-key'] === process.env.MASTER_KEY) {
        next();
      }
      else if (err.name === 'UnauthorizedError') {
        res.status(401).send('invalid token...');
      }
    });

    app.post('/token', function(req,res) {
      if (req.body) {
        moreApis.authCheck(req.body)
        .then(function(payload) {
          if (payload) {
            let token = jsonwebtoken.sign(payload, process.env.JWT_SECRET);
            res.status(200).json({jwt: token});
          } else {
            res.status(401).json({error: 'Invalid credentials.'});
          }
        },
        function(err) {
          res.status(500).json(err);
        })
      } else {
        res.status(400).send('Required username and password fields.');
      }
    });
  }
}

function start(sqlConfig) {

  cmdargs.handle(sqlConfig);

  if (cluster.isMaster && sqlConfig.useCpuCores > 1) {

    console.log(`Master ${process.pid} is running`);

    for (let i = 0; i < numCPUs && i < sqlConfig.useCpuCores; i++) {
      console.log(`Forking process number ${i}...`);
      cluster.fork();
    }

    cluster.on('exit', function(worker, code, signal) {
      console.log('Worker ' + worker.process.pid + ' died with code: '
        + code + ', and signal: ' + signal);
      console.log('Starting a new worker');
      cluster.fork();
    });


  } else {

    startXmysql(sqlConfig);

  }
}


start(sqlConfig);




