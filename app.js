const jwt = require('jsonwebtoken');
const expressJwt = require('express-jwt')
const path = require("path")
const express = require("express")
const mongoose = require('mongoose');
const nodemailer = require('nodemailer')
const smtpTransport = require('nodemailer-smtp-transport')
const router = express.Router()
const app = express()
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const jwtSecret = process.env.jwtSecret;
const regEmail = /^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/i
const port = 3000
mongoose.connect(process.env.mongoLink, { useNewUrlParser: true, useUnifiedTopology: true });
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
const projectSchema = new mongoose.Schema({
    "projectId": String,
    "projectName": String,
    "isPrivate": Boolean,
    "createAt": Date,
    "lastUpdateAt": Date,
    "data": Object
})
const userSchema = new mongoose.Schema({
    "email": String,
    "password": String,
    "userName": String,
    "isUsingPassword": Boolean,
    "projects": [projectSchema],
});
const codeSchema = new mongoose.Schema({
    "email": String,
    "code": String,
    "timeStamp": Number
});
const user = mongoose.model('Users', userSchema);
const mailCode = mongoose.model('Codes', codeSchema);
const transport = nodemailer.createTransport(smtpTransport({
    host: 'smtp.163.com',
    port: 465,
    secure: true,
    auth: {
        user: 'graphalgorithmpen@163.com',
        pass: process.env.mailKey
    }
}));
var setToken = function(email, password) { //签发Token
    return new Promise((resolve, reject) => {
        const token = jwt.sign({ email: email, password: password }, jwtSecret, { expiresIn: '24h' });
        resolve(token)
    })
}
var getToken = function(token) { //读取Token信息
    return new Promise((resolve, reject) => {
        if (!token) {
            reject({
                error: 'The token is empty'
            })
        } else {
            var info = jwt.verify(token.split(' ')[1], jwtSecret);
            resolve(info);
        }
    })
}
router.get('/getAllUsers', (req, res) => {
    user.find({}, function(err, data) {
        if (err) {
            return res.json({
                code: 504,
                message: '查询失败'
            })
        } else {
            let sendData = []
            data.map((item) => {
                sendData.push({ email: item.email, userName: item.userName })
            })
            return res.json({
                code: 200,
                message: '查询成功',
                users: sendData
            })
        }
    })
})

router.post('/loginByCaptcha', (req, res) => { //通过邮箱验证码注册或登录
    if (regEmail.test(req.body.email)) {
        mailCode.findOne({ 'email': req.body.email, "code": req.body.captcha }, function(err, pair) {
            if (err) {
                return res.json({
                    code: 504,
                    message: '查询失败'
                })
            } else {
                if (pair) {
                    let stamp = (new Date()).getTime();
                    if (stamp - pair.timeStamp < 180000)
                        user.findOne({ 'email': pair.email }, function(err, person) {
                            if (err) {
                                return res.json({
                                    code: 504,
                                    message: '查询失败'
                                })
                            } else {
                                if (person) {
                                    setToken(person.email, person.password).then(token => {
                                        mailCode.findOneAndDelete({ "email": req.body.email, "code": req.body.captcha }, (err) => { if (err) console.log(err) })
                                        return res.json({
                                            code: 200,
                                            message: '登录成功',
                                            user: { email: person.email, userName: person.userName, isUsingPassword: person.isUsingPassword, projects: person.projects },
                                            token: token
                                        })
                                    })
                                } else {
                                    var newUser = new user({
                                        "email": pair.email,
                                        "password": pair.code,
                                        "userName": pair.email,
                                        "isUsingPassword": false,
                                        "projects": []
                                    })
                                    newUser.save().then(() => {
                                        setToken(pair.email, pair.code).then(token => {
                                            mailCode.findOneAndDelete({ "email": req.body.email, "code": req.body.captcha }, (err) => { if (err) console.log(err) })
                                            return res.json({
                                                code: 200,
                                                message: '新用户注册成功',
                                                user: { email: pair.email, userName: pair.email, isUsingPassword: false, projects: [] },
                                                token: token
                                            })
                                        })
                                    });
                                }
                            }
                        })
                    else {
                        mailCode.findOneAndDelete({ "email": req.body.email, "code": req.body.captcha }, (err) => { if (err) console.log(err) })
                        return res.json({
                            code: 409,
                            message: '验证码过期'
                        })
                    }
                } else return res.json({
                    code: 405,
                    message: '验证码错误'
                })
            }
        });
    } else {
        return res.json({
            code: 422,
            message: '邮箱格式错误',
        })
    }
});
router.get('/getMailCode', (req, res) => { //获取邮箱验证码
    let email = req.query.email;
    if (regEmail.test(email)) {
        let code = ""
        for (let i = 0; i < 6; i++) {
            code += parseInt(Math.random() * 10)
        }
        transport.sendMail({
                from: 'TWT HOMEWORK<graphalgorithmpen@163.com>',
                to: [email, 'graphalgorithmpen@163.com'],
                subject: '[TWT HOMEWORK] 邮箱验证码',
                html: `<div style="font-size:15px;padding:30px;background-color: #f6f6f6;color: #31302f;">
                        <div style="background-color: #fff;width:300px;margin: 0 auto;position: relative;padding: 20px 30px 20px 30px;text-align: center;">
                        <img src="data:image/png;base64,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"
                                style="height: 32px;" />
                            <p>亲爱的用户，您好！</p>
                            <p>您正在进行TWT HOMEWORK账号操作</p>
                            <p>您的验证码为</p>
                            <strong style="color:#569ccb;font-size:30px">${code}</strong>
                            <p>请妥善保管好您的验证码，不要向其他人泄露</p>
                            <p>该验证码3分钟内有效</p>
                            <p style="font-size: 13px;color: #6b7280;margin-top: 30px">©️ Copyright Liu HongWei | 2021</p>
                        </div>
                    </div>`
            },
            function(error, data) {
                if (error) {
                    return res.json({
                        code: 500,
                        message: '邮件验证码发送失败',
                    })
                } else {
                    let stamp = (new Date()).getTime();
                    var newCode = new mailCode({
                        "email": email,
                        "code": code,
                        "timeStamp": stamp
                    })
                    newCode.save().then(() => {
                        return res.json({
                            code: 200,
                            message: '邮件验证码发送成功',
                        })
                    });
                }
            })
    } else {
        return res.json({
            code: 422,
            message: '邮箱格式错误',
        })
    }
});
router.post('/loginByPassword', (req, res) => { //通过密码登录
    if (regEmail.test(req.body.account)) {
        user.findOne({ 'email': req.body.account }, function(err, person) {
            if (err) {
                return res.json({
                    code: 504,
                    message: '查询失败'
                })
            } else {
                if (person) {
                    if (person.isUsingPassword == false) {
                        return res.json({
                            code: 406,
                            message: '用户未设置密码'
                        })
                    } else if (person.password == req.body.password)
                        setToken(person.email, person.password).then(token => {
                            return res.json({
                                code: 200,
                                message: '登录成功',
                                user: { email: person.email, userName: person.userName, isUsingPassword: person.isUsingPassword, projects: person.projects },
                                token: token
                            })
                        })
                    else return res.json({
                        code: 403,
                        message: '密码错误'
                    })
                } else return res.json({
                    code: 402,
                    message: '用户不存在'
                })
            }
        });
    } else {
        user.findOne({ 'userName': req.body.account }, function(err, person) {
            if (err) {
                return res.json({
                    code: 504,
                    message: '查询失败'
                })
            } else {
                if (person) {
                    if (person.isUsingPassword == false) {
                        return res.json({
                            code: 406,
                            message: '用户未设置密码'
                        })
                    } else if (person.password == req.body.password)
                        setToken(person.email, person.password).then(token => {
                            return res.json({
                                code: 200,
                                message: '登录成功',
                                user: { email: person.email, userName: person.userName, isUsingPassword: person.isUsingPassword, projects: person.projects },
                                token: token
                            })
                        })
                    else return res.json({
                        code: 403,
                        message: '密码错误'
                    })
                } else return res.json({
                    code: 402,
                    message: '用户不存在'
                })
            }
        });
    }
});
router.get("/getNewToken", (req, res) => { //更新Token
    var token = req.headers['authorization'];
    if (token == undefined) {
        return res.json({
            code: 407,
            message: '未携带token'
        })
    } else {
        getToken(token).then((data) => {
            setToken(data.email, data.password).then(token => {
                return res.json({
                    code: 200,
                    message: '更新Token成功',
                    token: token
                })
            })
        }).catch(() => {
            return res.json({
                code: 501,
                message: '验证token失败'
            })
        })
    }
});
router.get("/getProjects", (req, res) => { //获得用户所有项目
    var token = req.headers['authorization'];
    if (token == undefined) {
        return res.json({
            code: 407,
            message: '未携带token'
        })
    } else {
        getToken(token).then((data) => {
            user.findOne({ 'email': data.email, "password": data.password }, function(err, person) {
                if (err || !person)
                    return res.json({
                        code: 504,
                        message: '查询失败'
                    })
                else
                    return res.json({
                        code: 200,
                        message: '查询成功',
                        projects: person.projects,
                    })
            });
        }).catch(() => {
            return res.json({
                code: 501,
                message: '验证token失败'
            })
        })
    }
});
router.post("/setPassword", (req, res) => { //设置密码
    let token = req.headers['authorization'];
    if (token == undefined) {
        return res.json({
            code: 407,
            message: '未携带token'
        })
    } else {
        getToken(token).then((data) => {
            user.findOneAndUpdate({ 'email': data.email, 'password': data.password }, { 'password': req.body.password, 'isUsingPassword': true }, function(err, person) {
                if (err || !person) {
                    return res.json({
                        code: 502,
                        message: '设置密码失败'
                    })
                } else {
                    setToken(data.email, req.body.password).then(token => {
                        return res.json({
                            code: 200,
                            message: '设置密码成功',
                            user: { email: person.email, userName: person.userName, isUsingPassword: true, projects: person.projects },
                            token: token
                        })
                    })
                }
            });
        }).catch(() => {
            return res.json({
                code: 501,
                message: '验证token失败'
            })
        })
    }
});
router.post("/setUserName", (req, res) => { //设置用户名
    let token = req.headers['authorization'];
    if (token == undefined) {
        return res.json({
            code: 407,
            message: '未携带token'
        })
    } else {
        user.findOne({ 'userName': req.body.userName }, function(err, pair) {
            if (err) {
                return res.json({
                    code: 504,
                    message: '查询失败'
                });
            } else {
                if (pair)
                    return res.json({
                        code: 408,
                        message: '用户名已存在'
                    });
                else {
                    getToken(token).then((data) => {
                        user.findOneAndUpdate({ 'email': data.email, 'password': data.password }, { 'userName': req.body.userName }, (err, person) => {
                            if (err)
                                return res.json({
                                    code: 503,
                                    message: '设置用户名失败'
                                });
                            else {
                                return res.json({
                                    code: 200,
                                    message: '设置用户名成功',
                                    user: { email: person.email, userName: req.body.userName, isUsingPassword: person.isUsingPassword, projects: person.projects },
                                    token: token
                                })
                            }
                        })
                    }).catch((err) => {
                        console.log(err)
                        return res.json({
                            code: 501,
                            message: '验证token失败'
                        })
                    })
                }
            }
        });
    }
});
router.post("/register", (req, res) => { //通过用户名和密码注册
    user.findOne({ 'userName': req.body.userName }, function(err, pair) {
        if (err) {
            return res.json({
                code: 504,
                message: '查询失败'
            });
        } else {
            if (pair)
                return res.json({
                    code: 408,
                    message: '用户名已存在'
                });
            else {
                var newUser = new user({
                    "email": req.body.userName,
                    "password": req.body.password,
                    "userName": req.body.userName,
                    "isUsingPassword": true,
                    "projects": []
                });
                newUser.save().then(() => {
                    setToken(req.body.userName, req.body.password).then(token => {
                        return res.json({
                            code: 200,
                            message: '新用户注册成功',
                            user: { email: req.body.userName, password: req.body.password, isUsingPassword: true, projects: [] },
                            token: token
                        })
                    })
                });
            }
        }
    });
});
router.post("/addProject", (req, res) => { //添加项目
    let token = req.headers['authorization'];
    if (token == undefined) {
        return res.json({
            code: 407,
            message: '未携带token'
        })
    } else {
        getToken(token).then((data) => {
            user.findOneAndUpdate({ email: data.email, password: data.password }, {
                '$push': {
                    projects: {
                        projectName: req.body.projectName,
                        isPrivate: req.body.isPrivate == undefined ? true : req.body.isPrivate,
                        createAt: new Date(),
                        lastUpdateAt: new Date(),
                        data: req.body.data
                    }
                }
            }, function(err, person) {
                if (err || !person) {
                    return res.json({
                        code: 510,
                        message: '创建项目失败'
                    });
                } else {
                    if (person.projects.length > 20)
                        return res.json({
                            code: 411,
                            message: '项目达到上限',
                        });
                    person.projects.push({
                        projectName: req.body.projectName,
                        isPrivate: req.body.isPrivate == undefined ? false : req.body.isPrivate,
                        createAt: new Date(),
                        lastUpdateAt: new Date(),
                        data: req.body.data
                    })
                    return res.json({
                        code: 200,
                        message: '创建项目成功',
                        user: { email: person.email, userName: person.userName, isUsingPassword: person.isUsingPassword, projects: person.projects },
                    });
                }
            })
        }).catch(() => {
            return res.json({
                code: 501,
                message: '验证token失败'
            })
        })
    }
});
router.post("/updateProject", (req, res) => { //更新项目
    let token = req.headers['authorization'];
    if (token == undefined) {
        return res.json({
            code: 407,
            message: '未携带token'
        })
    } else {
        getToken(token).then((data) => {
            user.findOne({ "projects._id": req.body._id }, (err, person) => {
                if (err || !person) {
                    return res.json({
                        code: 511,
                        message: '更新项目失败'
                    });
                } else {
                    let subDoc = person.projects.id(req.body._id)
                    subDoc.projectName = req.body.projectName == undefined ? subDoc.projectName : req.body.projectName
                    subDoc.isPrivate = req.body.isPrivate == undefined ? subDoc.isPrivate : req.body.isPrivate
                    subDoc.data = req.body.data == undefined ? subDoc.data : req.body.data
                    subDoc.lastUpdateAt = new Date()
                    person.save().then(() => {
                        return res.json({
                            code: 200,
                            message: '更新项目成功',
                            user: { email: person.email, userName: person.userName, isUsingPassword: person.isUsingPassword, projects: person.projects },
                        });
                    })
                }
            })
        }).catch(() => {
            return res.json({
                code: 501,
                message: '验证token失败'
            })
        })
    }
});
router.delete("/deleteProject", (req, res) => { //删除项目
    let token = req.headers['authorization'];
    if (token == undefined) {
        return res.json({
            code: 407,
            message: '未携带token'
        })
    } else {
        user.findOne({ "projects._id": req.body._id }, (err, person) => {
            if (err || !person) {
                return res.json({
                    code: 512,
                    message: '删除项目失败'
                });
            } else {
                person.projects.id(req.body._id).remove()
                person.save().then(() => {
                    return res.json({
                        code: 200,
                        message: '删除项目成功',
                        user: { email: person.email, userName: person.userName, isUsingPassword: person.isUsingPassword, projects: person.projects },
                    });
                })
            }
        })
    }
});
router.get("/project/:projectId", (req, res) => {
    let token = req.headers['authorization'];
    user.findOne({ "projects._id": req.params.projectId }, (err, person) => {
        if (err || !person) {
            return res.json({
                code: 513,
                message: '查询项目失败'
            });
        } else {
            let result = person.projects.id(req.params.projectId)
            if (token == undefined) {
                if (result.isPrivate == true)
                    return res.json({
                        code: 410,
                        message: '无法访问私有项目'
                    });
                else return res.json({
                    code: 200,
                    message: '查询项目成功',
                    project: result,
                    owner: person.id,
                    belongTo: false,
                });
            } else {
                getToken(token).then((data) => {
                    if (result.isPrivate == true && person.email != data.email) {
                        return res.json({
                            code: 410,
                            message: '无法访问私有项目'
                        });
                    } else {
                        return res.json({
                            code: 200,
                            message: '查询项目成功',
                            project: result,
                            owner: person.id,
                            belongTo: person.email == data.email,
                        });
                    }
                }).catch(() => {
                    return res.json({
                        code: 501,
                        message: '验证token失败'
                    })
                })

            }
        }
    })
});

router.get("/", (req, res) => {
    res.send({
        code: 0,
        msg: '你好(*´▽｀)ノノ！'
    });
});
app.all("*", function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "content-type,authorization");
    res.header("Access-Control-Allow-Methods", "DELETE,PUT,POST,GET,OPTIONS");
    if (req.method.toLowerCase() == 'options')
        return res.sendStatus(200);
    else
        next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));
app.use(function(req, res, next) {
    let token = req.headers['authorization'];
    if (token == undefined) {
        next();
    } else {
        getToken(token).then((data) => {
            user.findOne({ 'email': data.email, 'password': data.password }, function(err, person) {
                if (err) {
                    return res.json({
                        code: 501,
                        message: '验证token失败'
                    })
                } else {
                    if (person) next();
                    else return res.json({
                        code: 401,
                        message: '无效token'
                    })
                }
            });
        }).catch(() => {
            return res.json({
                code: 501,
                message: '验证token失败'
            })
        })
    }
});
app.use(expressJwt({
    secret: jwtSecret,
    algorithms: ['HS256']
}).unless({
    path: ['/', '/getAllUsers', '/loginByCaptcha', '/getMailCode', '/loginByPassword', '/register', /^\/project\/.*/]
}));
app.use(function(err, req, res, next) {
    if (err.status == 401) {
        return res.json({
            code: 401,
            message: '无效token'
        })
    }
});
app.use('/', router);
// app.listen(port, () => {
//     console.log(`链接数据库成功，实例运行在 http://localhost:${port}`);
// });
module.exports = app;