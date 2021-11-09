const jwt = require('jsonwebtoken');
const expressJwt = require('express-jwt')
const path = require("path")
const express = require("express")
const mongoose = require('mongoose');
const nodemailer = require('nodemailer')
const smtpTransport = require('nodemailer-smtp-transport')
const router = express.Router()
const app = express()
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
                            <p style="font-size: 13px;color: #6b7280;margin-top: 30px">©️ Copyright Load-Region | 2021</p>
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
    path: ['/', '/loginByCaptcha', '/getMailCode', '/loginByPassword', '/register', /^\/project\/.*/]
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