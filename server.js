// Require the modules
const express = require('express');
const app = express();
const server = require('http').Server(app); // Initiate http server with express
const io = require('socket.io')(server); // Connect server with socket io
const multer  = require('multer'); // Multer for file uploads 
const hbjs = require('handbrake-js');
const path = require('path'); // For file path
const cookieParser = require('cookie-parser');// For saving user sessions
const cookieMiddleware = require('./middleware/userCookie');// Middle ware for sessions
const fs = require('fs');// For reading the file type
const config = require('config');
const PORT = config.get('port');

// Use Middlewares 
app.set('views', __dirname + '/views'); // views folder for view app.ejs
app.set('view engine', 'ejs');// Set view engine
app.use('/', express.static(__dirname + '/public')); // For static files
app.use('/encoded', express.static(__dirname + '/encoded')); 
app.use(cookieParser());
app.use(cookieMiddleware());

// Initialise Multer to save uploaded files with date in uploads folder 
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.resolve(__dirname , 'uploads'))
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '_' + file.originalname)
    }
});

const upload = multer({storage : storage});

// When request to /history is made save it according to the user session id 
app.get('/history', (req, res) => {
    let dir = path.join(__dirname, 'encoded', req.cookies._uid);
    fs.exists(dir, (exists) => {
        if(exists){
            fs.readdir(dir, (err, files) => {
                if (err) throw err;
                res.json(files.reverse());
            });
        }else{
            res.json([]);
        }
    });
});

// when a file is uploaded move the file to uploads folder 
app.post('/upload', upload.single('file'), (req, res) => {
    if(req.file){
        let video = req.file,
            user = req.cookies._uid;

        let upload_path = video.path,
            user_upload = path.join(__dirname, '/uploads/', user),
            move_path = path.join(__dirname, '/uploads/' , user , video.filename);


        fs.exists(user_upload, (exists) => {
            if(!exists){
                fs.mkdir(user_upload,function(err){
                    if (err) {
                        return console.error(err);
                    }
                    moveUploadedFileToUserDir(
                        upload_path, move_path, video.filename,  res
                    );
                });
            }else{
                moveUploadedFileToUserDir(
                    upload_path, move_path, video.filename, res
                );
            }
        });
        createUserEncodeDir(user);
    }else{
        res.json({
            uploaded : false
        })
    }
});

// render app.ejs for all routes
app.get('*', (req, res) => {
    res.render('app');
});

let moveUploadedFileToUserDir = (upload_path, move_path, filename, res) =>{
    fs.rename(upload_path, move_path, (err) => {
        if (err) throw err;
        res.json({
            uploaded : true,
            path : filename
        });
    });
};

let createUserEncodeDir = (user) => {
    let dir = path.join(__dirname, '/encoded/', user);
    fs.exists(dir, (exists) => {
        if(!exists) {
            fs.mkdir(dir, function (err) {
                if (err) {
                    return console.error(err);
                }
            });
        }
    });
};

let deleteVideo = (path) => {
    fs.unlink(path, (err) => {
        if (err) throw err;
    });
};
// Start socket io connection
io.on('connection', (socket) => {

    socket.on('encode', (data) => {
        let handbrake,
            completed = false,
            file = data.file,
            user = data.user,
            convert_ext = data.convert_ext,
            input = path.join(__dirname, '/uploads/', user, '/' + file),
            encoded_file = file + '_to_.' + convert_ext,
            output = path.join(__dirname, '/encoded/', user , '/', encoded_file);

        handbrake = hbjs.spawn({
            input: input,
            output : output,
            preset : 'Universal'
        })
        .on('progress', progress => {
            socket.emit('progress',{
                percentage : progress.percentComplete,
                eta : progress.eta
            });
        })
        .on('complete', () => {
            completed = true;
            socket.emit('complete',{
                encoded_file : encoded_file
            });
        });

        socket.on('disconnect', () => {
            if(!completed){
                console.log('Not completed');
                handbrake.cancel();
                deleteVideo(input);
                deleteVideo(output);
            }
        });
    });
});
// Start server
server.listen(PORT, () => console.log('Server running on Port: '+ PORT));
