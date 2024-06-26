var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const WebSocket = require('ws');

var jwt = require('jsonwebtoken');
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    console.error('FATAL ERROR: JWT_SECRET env var is not defined.');
    process.exit(1); // Exit the process with an error code
}

var apiRouter = require('./routes/api');
var userRouter = require('./routes/users');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// when user opens /login or /register, the file public/login.html should be returned
app.get(["/login", "/register"], function(req, res, next) {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

function verifyRequest(req) {
    let token = req.headers['authorization'];
    req.jwtProvided = false;
    req.jwtVerifyError = false;
    req.jwtExpired = false;
    req.jwtPayload = null;

    if (token) {
        console.log(`> Authorization: Token "${token}" provided as Authorization-header`)
        token = token.replace("Bearer ", "")
        req.jwtProvided = true;
        jwt.verify(token, jwtSecret, (err, decoded) => {
            if (err) {
                req.jwtVerifyError = true;
                // Check if the error is because the JWT has expired
                if (err.name === 'TokenExpiredError') {
                    req.jwtExpired = true; // You can add this line to indicate specifically that the JWT expired
                }
            } else {
                // console.log("JWT: ", decoded)
                req.jwtPayload = decoded;
            }
        });
    } else {
        console.log("> Authorization: No token provided as Authorization-header")
    }
}

function verifyMiddleware(req, res, next) {
  console.log(`Verify token on request to ${req.url}`)
  verifyRequest(req)
  if(!req.jwtProvided) {
    console.log(`>>> Not authorized, no token provided`)
  } else if(req.jwtProvided && !req.jwtVerifyError) {
    console.log(`>>> Authorized`)
  } else if(req.jwtProvided && req.jwtVerifyError && req.jwtExpired) {
    console.log(`>>> Not authorized, token expired`)
  } else {
    console.log(`>>> Not authorized, error during token verification`)
  }
  next()
}

// Apply the verifyMiddleware middleware to all routes
// The order of our middlewares matters: If we put this before
// setting up our express.static middleware, JWT would even be checked
// for every static resource, which would introduce unncessary overhead.
app.use(verifyMiddleware);

// handles /user_handling/login and /user_handling/register
app.use('/user_handling', userRouter);

app.use('/api', apiRouter)

// create websocket server
// One and only one of the "port", "server", or "noServer" options must be specified
// Connect to this using the URL ws://localhost:3001
const wss = new WebSocket.Server({ port: 3001 });
wss.on('connection', (ws, req) => {
  // Info: This connection is currently not secured using our JWT.
  // Thus, anybody could connect to our websocket at the moment.
  // In a real application, you now would, for example, perform some kind of handshake using messages or pass the JWT upon connection.
  console.log(`WS Client connected, we now have ${wss.clients.size} connected clients`)

  ws.on('message', function message(data, isBinary) {
    const message = isBinary ? data : data.toString();
  
    console.log(`Received message: ${message}`)

    // Broadcast the message to all clients
    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message)
        console.log(`> Forwarded message "${message}" to client`)
      }
    });
  });

  ws.on('close', () => {
    console.log(`Client disconnected, we now have ${wss.clients.size} connected clients`)
  });
});

module.exports = app;
