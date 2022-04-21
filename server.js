const express = require('express')
const app = express()
const cors = require('cors')
require('dotenv').config()

// add libraries
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

// add middleware
app.use(bodyParser.urlencoded({"extended": "false"}));
app.use(bodyParser.json());

app.use(cors())
app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

// build models
// setup - connect via URI
mongoose.connect(process.env['MONGO_URI'], { useNewUrlParser: true, useUnifiedTopology: true });

// setup - create DB schema
const { Schema } = mongoose;

// define schemas
const logSchema = new Schema(
  {
    description: { type: String, required: true },
    duration: { type: Number, required: true },
    date: { type: Date, required: true }
  }, 
  { _id : false }
);

const userSchema = new Schema(
  {
    username: { type: String, required: true },
    count: { type: Number, default: 0 },
    log: [logSchema]
  }
);

// init model
let Document = mongoose.model('Document', userSchema);

// model methods
const saveUser = (userName, done) => {
  let newUser = new Document({username: userName})
  newUser.save((err, record) => {
    if (err) return done(err);
    done(null, { _id: record._id, username: record.username });
  })
};

const saveExercise = (id, newCount, updateObj, done) => {
  let options = {
    new: true, 
    select: "_id username",
    runValidators: true
  };

  Document.findByIdAndUpdate(
    mongoose.Types.ObjectId(id), 
    {$push: {log: updateObj}, count: newCount},
    options,
    (updateErr, record) => {
      if (updateErr) return done(updateErr);
      try {
        done(null, 
             { 
               ...record.toObject(),
               date: updateObj.date.toDateString(),
               duration: updateObj.duration,
               description: updateObj.description
             })
      } catch (e) {
      done(e)
      };
    });
};

const findExerciseCount = (id, done) => {
  Document.findById(
    mongoose.Types.ObjectId(id), 
    "_id log", 
    (err, record) => {
      if (err) return done(err);
      try {
        done(null, record.log.length);
      } catch (e) {
        done(e);
      };
    }
  );
};

// api methods
// POST to /api/users with form data username to create a new user
const user = (req, res) => {
  // response from POST /api/users with form data username will be an object with username and _id properties
  saveUser(req.body.username, (saveErr, saveResult) => {
    if (saveErr) return res.end(saveErr);
    res.json(saveResult);
  });
};

//GET request to /api/users to get a list of all users
const users = (req, res) => {
  //returns an array containing a user's username and _id  
  Document
    .find({})
    .select("_id username")
    .exec((err, query) => {
      if (err) return res.end(err);
      res.json(query);
    });
};

//POST to /api/users/:_id/exercises with form data description, duration, and optionally date. 
const exercise = (req, res) => {
  let userId = req.params._id
  //response returned from POST /api/users/:_id/exercises will be the user object with the exercise fields added
  const exerciseUpdate = {
    description: req.body.description,
    duration: parseInt(req.body.duration)
  };
  
  //If no date is supplied, the current date will be used.
  if (req.body.date) {
    exerciseUpdate.date = new Date(req.body.date);
    
    if (exerciseUpdate.date === "Invalid Date") {
      res.end({error: exerciseUpdate.date})
    };
  } else {
    exerciseUpdate.date = new Date();
  };

  //update and return exercise object
  findExerciseCount(userId, (countErr, oldCount) => {
    if (countErr) return res.end(countErr.message);
    saveExercise(userId, oldCount + 1, exerciseUpdate, (updateErr, update) => {
      if (updateErr) return res.end(updateErr);
      res.json(update);
    });
  });
};

//GET request to /api/users/:_id/logs to retrieve a full exercise log of any user
//You can add from, to and limit parameters to a GET /api/users/:_id/logs request to retrieve part of the log of any user. from and to are dates in yyyy-mm-dd format. limit is an integer of how many logs to send back
const logs = (req, res) => {
  // init from date to -Infinity, update if passed via query
  let from = -Infinity;
  if (req.query.hasOwnProperty('from')) {
    from = new Date(req.query.from)
  } 

  // init to date to Infinity, update if passed via query
  let to = Infinity;
  if (req.query.hasOwnProperty('to')) {
    to = new Date(req.query.to)
  }
  
  Document
    .findById(req.params._id)
    .exec((err, result) => {
      if (err) return res.end(err);
      
      let record = result.toObject();

      // init limit to the total logs, update if passed via query 
      // (numbers greater than total logs will return all available logs)
      let limit = record.log.length;
      if (req.query.hasOwnProperty('limit')) {
        limit = parseInt(req.query.limit);
      };

      let dateLogs = record.log
          .filter(items => {return items.date > from && items.date < to})
          .map(items => {return {...items, date: items.date.toDateString()}})
          .slice(0, limit);
      
      res.json({
        _id: record._id,
        username: record.username,
        count: dateLogs.length,
        log: dateLogs
      });
  });
  //returns a user object (_id username) with 
    // a count property representing the number of exercises that belong to that user
    // a log array of all the exercises added
      //Each item in the log array should have a description, duration, and date properties
};

// api endpoints
app
  .route('/api/users')
  .post(user)
  .get(users)

app 
  .route('/api/users/:_id/exercises')
  .post(exercise)

app
  .route('/api/users/:_id/logs')
  .get(logs)


const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
