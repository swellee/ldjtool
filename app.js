/**
 * Created by swellee on 2016/9/18.
 */
var packInfo = require("./package.json");
var fs = require("fs");
var os = require("os");
var path = require("path");
var prompt = require("prompt");
var sh = require("child_process");
var fork = sh.fork;
var userCfgDir = path.join(os.homedir(), ".ldjtool");
var userCfgPath = path.join(userCfgDir, "cfg.json");
var userUIRulePath = path.join(userCfgDir, "ui_rule.json");
var toolCfg = require("./bin/config");
var ruleCfg = require("./bin/rule.json");
var cfg = toolCfg;
const uiwatch = require("watch");
var uiwatching = false;

var options = {
    "-h": showHelp,
    "-c": modConfig,
    "-a": createPrjAP,
    "-u": parseUI,
    "-ux": addUIClazz,
    "-uw": watchUIdir,
    "-m": modPrjConfig,
    "-x": parseSheet,
    "-b": buildApp,
    "-p": publishApp
};


//--------------------enter-------------------
var cmds;
var routes = {};

function main(argv) {
    //initRoutes
    routes.ui = path.resolve(__dirname, "./routes/ui.js"); //use as fork
    routes.util = require("./routes/util");
    routes.sheet = require("./routes/sheet");
    //是否需要强制升级配置
    routes.util.mkdirs(userCfgDir, function() {
        try {
            fs.accessSync(userUIRulePath, fs.R_OK);
            var localUiRule = require(userUIRulePath);
            if (localUiRule.ver != packInfo.uiRuleVer) {
                fs.writeFileSync(userUIRulePath, fs.readFileSync(path.resolve(__dirname, "./bin/rule.json")));
            }
        } catch (e) {
            //copy ui rule file
            fs.writeFileSync(userUIRulePath, fs.readFileSync(path.resolve(__dirname, "./bin/rule.json")));
        }

        try {
            fs.accessSync(userCfgPath, fs.R_OK);
            var uCfg = require(userCfgPath);
            var match = true;
            for (var key in cfg) {
                if (!uCfg.hasOwnProperty(key)) {
                    match = false;
                    uCfg[key] = cfg[key]; //没有的key，先添加上
                } else {
                    cfg[key] = uCfg[key];
                }
            }


            if (!match || uCfg.ver != packInfo.cfgVer)
                throw new Error("配置格式升级");
        } catch (e) {
            console.log('需要重新配置工具参数。。。');
            modConfig();
            return;
        }


        cmds = argv;

        //parse args
        cmds.shift(); //del node
        cmds.shift(); //del app.js
        var cmd = cmds.shift(); //command
        routeCmd(cmd);
    });

}


function routeCmd(cmd) {
    if (options[cmd]) {
        options[cmd]();
    } else {
        showHelp();
    }
}

function showHelp() {
    console.log("当前版本：" + packInfo.version + "\n" +
        "使用说明：\n\
    ldjtool -h : 显示该使用说明;\n\
    ldjtool -c : 重新配置工具参数;\n\
    ldjtool -a [laya_engine_src_path]: 在当前目录生成项目使用的.actionScriptProperties; -a后跟的参数为laya引擎的src代码路径，如果未给，则启用输入模式录入\n\
    ldjtool -m : 在项目目录下使用此命令，可更改项目的一些配置（如版本号等）\n\
    ldjtool -x [xlsx_in_path][xlsx_out_path]: 将配表转换成程序使用的文件，可选参数xlsx_in_path表示要处理的配表文件夹路径（不传则使用ldjtool -c配置的配表目录），\n\
    可选参数xlsx_out_path表示生成的tpl.json的存放目录（不传则使用ldjtool -c配置的放置目录）；\n\n\
    ldjtool -u [path or file] : 将指定目录下或指定的某个的mornUI生成的xml文件转换成as代码文件,不传路径则使用配置的baseUiFileDir路径；\n\n\
    ldjtool -ux : 添加UI解析时的 类名-包名 规则，以适应生成代码时对自定义类映射的支持；\n\n\
    ldjtool -uw : 监控UI文件目录的改动，自动重新生成UI代码；\n\n\
    ldjtool -b [projectDir] :编译项目；projectDir为项目路径，不传则使用当前路径（如果当前路径不是客户端目录，则会出错）\n\
    ldjtool -p [projectDir] [ver]:发布项目，projectDir为项目路径，不传则使用当前路径, 参数ver为版本号，不传则使用老的版本号，如果只传一个参数，则此参数当作版本号处理");
}

//只会遍历baseUIFileDir之下的一级目录！！！！！
function parseUI() {
    var loc = cfg.baseUiFileDir;
    if (cmds.length) {
        loc = cmds.shift();
    }
    loc = path.relative(process.cwd(), loc);


    fs.access(loc, fs.R_OK | fs.W_OK, function(err) {
        if (err) {
            routes.util.err(err);
        }
        var uifliles = [];
        listUIFiles(loc, uifliles);

        parseUI2As(uifliles);

    });
}

function addUIClazz() {
    // body...
    console.log("添加自定义类到UI解析规则:")
    var schema = {
        properties: {
            class: {
                message: "类名"
            },
            package: {
                message: "包名"
            }
        }
    };

    prompt.start();
    prompt.get(schema, function(err, result) {
        var rule = require(userUIRulePath);
        if (rule.import.hasOwnProperty(result.class)) {
            console.log(`发现已有类名${result.class},其映射的包名为${rule.import[result.class]},是否覆盖？（y/n）`);
            process.stdin.pause();
            process.stdin.resume();
            process.stdin.on("data", (input) => {
                if (input) {
                    input = input.toString().replace(/[\r\n]/, "");
                }
                if (input == "y" || input == "Y") {
                    rule.import[result.class] = result.package;
                    writeRule(rule);
                } else {
                    console.log(`取消覆盖，类名-包名映射(${result.class}->${result.package})未添加！！`)
                    process.exit(0);
                }
            })
        } else {
            rule.import[result.class] = result.package;
            writeRule(rule);
        }


    })

}

function writeRule(rule) {
    fs.writeFile(userUIRulePath, JSON.stringify(rule), function(err) {
        if (err) {
            routes.util.err(err);
        } else {
            console.log("ok")
            process.exit(0);
        }
    })
}

function watchUIdir() {
    if (uiwatching)
        return;
    uiwatching = true;
    console.log("开始监控UI目录...")
    var dir = cfg.baseUiFileDir;
    uiwatch.createMonitor(dir, function(monitor) {
        monitor.on("created", function(f, stat) {
            // Handle new files
            parseUI2As([f]);
            console.log("已转换UI文件>>", f);
        })
        monitor.on("changed", function(f, curr, prev) {
            // Handle file changes
            parseUI2As([f]);
            console.log("已转换UI文件>>", f);

        })
        monitor.on("removed", function(f, stat) {
                // Handle removed files
            })
            // monitor.stop(); // Stop watching
    })
}

function listUIFiles(loc, uifliles) {
    if (fs.statSync(loc).isDirectory()) {

        try {
            var files = fs.readdirSync(loc);
            for (var i = files.length - 1; i >= 0; i--) {
                var fl = path.resolve(loc, files[i]);
                listUIFiles(fl, uifliles);
            }
        } catch (e) {
            routes.util.err(e);
        }
    } else {
        uifliles.push(loc);
    }
}


function parseUI2As(uifliles) {
    if (uifliles.length) {
        var file = uifliles.pop();
        try {
            var p = fork(routes.ui, [file]);
            p.on("message", function(m) {
                //干掉子进程
                p.kill();
                if (m == "ok") {
                    parseUI2As(uifliles);
                } else {
                    console.log(m);
                    parseUI2As(uifliles);
                }
            })
        } catch (e) {
            routes.util.err(e);
        }
    }

}

function parseSheet() {
    routes.sheet(cfg, cmds);
}

function buildApp(cb, ignoreSdk) {
    var prjPath = process.cwd();
    if (cmds.length) {
        var prjPath = cmds.shift(); //项目目录
    }
    var wineVpath = "";
    var platform = os.platform();
    if (platform != "win32") {
        if (cfg.layaCmd.indexOf("wine") != -1) {
            wineVpath = "z:"; //linux & mac use wine，针对laya1.3版本，需要在 exe程序 的参数路径上加上z:虚拟盘符以指向linux 的 root路径，后续如果升级laya.js.exe再观察
        }
        cfg.layaPara += ";windowshow=false" //非windows，不显示gui
    }

    var cmd = cfg.layaCmd + ' "' + path.join(wineVpath + prjPath, ".actionScriptProperties") + cfg.layaPara + '"';
    sh.exec(cmd, { maxBuffer: 2560 * 2560 }, function(err, stdout, stderr) {
        if (err) {
            console.log(err);
        } else {
            console.log(stdout);

            //给分包的js文件添加可调试标记
            var packJsPath = path.join(prjPath, "bin", "h5", "js");
            fs.readdir(packJsPath, function(err, files) {
                if (err) {
                    routes.util.err(err);
                }

                for (var i in files) {
                    var file = files[i];
                    var flPath = path.resolve(packJsPath, file);
                    var flName = path.basename(file);
                    var fl = fs.readFileSync(flPath, "utf8");
                    fl += "//# sourceURL=" + file;
                    fs.appendFileSync(flPath, fl, { flag: "w" });
                }

            })

            if (!ignoreSdk) {
                routes.util.dust("index", { ver: "0.0.1", debug: true }, function(out) {
                    var htmlfile = path.resolve(prjPath, "bin/h5/index.html");
                    fs.writeFileSync(htmlfile, out);
                })
            }
            cb && cb(prjPath);
        }
    })
}

function publishApp() {
    var ver = ''; //如果 ldjtool -p 后跟参数，则最后一个参数作为版本号处理
    if (cmds.length) {
        ver = cmds.pop();
    }

    buildApp(function(prjPath) {
        var cpath = ".prjCfg";
        //第一次，生成项目信息
        try {
            fs.accessSync(cpath, fs.R_OK);
        } catch (err) {
            var pcfg = { name: "鹿鼎记", version: "0.0.1" };
            fs.appendFileSync(cpath, JSON.stringify(pcfg))
        }

        var oldCfg = JSON.parse(fs.readFileSync(cpath, "utf8"));
        //将版本号写入配置
        if (ver) {
            oldCfg.version = ver;
            fs.writeFileSync(cpath, JSON.stringify(oldCfg));
        } else {
            ver = oldCfg.version;
        }

        console.log("压缩代码");
        var minTool = require("uglify-js");
        var jsFile = path.resolve(prjPath, "bin/h5/main.max.js");
        console.log(jsFile);
        var result = minTool.minify(jsFile, {
            mangle: {
                keep_fnames: true //加上这个,才能在压缩后保留正确的类名
            }
        });
        fs.writeFileSync(jsFile, result.code);
        var depJsDir = path.resolve(prjPath, "bin/h5/js");
        var depJsfiles = fs.readdirSync(depJsDir);
        for (var i in depJsfiles) {
            var file = depJsfiles[i];
            var flilePath = path.resolve(depJsDir, file);
            console.log(flilePath)
            result = minTool.minify(flilePath, {
                mangle: {
                    keep_fnames: true
                }
            });
            fs.writeFileSync(flilePath, result.code);
        }

        console.log("将版本号更新到index.html");
        routes.util.dust("index", { ver: ver, debug: false }, function(out) {
            var htmlfile = path.resolve(prjPath, "bin/h5/index.html");
            fs.writeFileSync(htmlfile, out);
        })
    }, true);

}

function modConfig() {
    console.log("请根据指引修改配置信息：")
    var comments = require("./bin/cfgcmts.json");
    var schema = {
        properties: {}
    };

    for (var key in cfg) {
        if (comments[key]) {
            schema.properties[key] = {
                message: comments[key],
                default: cfg[key]
            };
        }
    }


    prompt.start();
    prompt.get(schema, function(err, result) {
        for (var mk in result) {
            cfg[mk] = result[mk];
        }
        var cpath = pathSep(path.resolve(__dirname, "./bin/config.json"));
        //写入config.json
        fs.writeFile(userCfgPath, JSON.stringify(cfg), function(err) {
            if (err) {
                routes.util.err(err);
            } else {
                process.exit(0);
            }
        })
    })
}

function createPrjAP() {
    var engineSrc = "path/to/laya/engine/src";
    if (cmds.length) {
        engineSrc = cmds.shift(); //如果有第二个参数，直接作为engine_src    
        writeAP(engineSrc);
    } else {
        //通过用户输入引擎路径
        process.stdin.pause();
        console.log('请输入laya引擎库路径（如：path/to/laya/src）');
        process.stdin.resume();
        process.stdin.on("data", function(chunk) {
            if (chunk) {
                engineSrc = chunk.toString();
            }

            writeAP(engineSrc);
            process.stdin.end();
        });
    }




}

function writeAP(engineSrc) {
    engineSrc = pathSep(engineSrc);
    if (engineSrc.charAt(engineSrc.length - 1) == "/") {
        engineSrc = engineSrc.substr(0, engineSrc.length - 1);
    }
    routes.util.dust("ap", { engineSrc: engineSrc }, function(out) {
        fs.appendFileSync(".actionScriptProperties", out, { flag: "w" });
    })
}

function modPrjConfig() {
    var cwd = process.cwd();
    console.log(`当前路径为${cwd},是否要修改“版本号”、“背景”等项目配置，y/n？`);
    process.stdin.resume();
    process.stdin.once("data", function(chunk) {
        if (chunk) {
            chunk = pathSep(chunk.toString());
        }
        if (chunk != "y" && chunk != "Y") {
            console.log("已取消");
            process.exit();
        } else {
            doModPrjCfg();
        }

    });

}

function doModPrjCfg() {
    var cpath = ".prjCfg";
    //第一次，生成项目信息
    try {
        fs.accessSync(cpath, fs.R_OK);
    } catch (err) {
        var pcfg = { version: "0.0.1" };
        fs.appendFileSync(cpath, JSON.stringify(pcfg))
    }

    var oldCfg = JSON.parse(fs.readFileSync(cpath, "utf8"));

    var schema = {
        properties: {}
    };
    for (key in oldCfg) {
        schema.properties[key] = {
            message: key,
            default: oldCfg[key]
        }
    }

    prompt.start();
    prompt.get(schema, function(err, result) {
        for (var mk in result) {
            oldCfg[mk] = result[mk]
        }
        fs.writeFile(cpath, JSON.stringify(oldCfg), function(err) {
            if (err) {
                routes.util.err(err);
            } else {
                process.exit(0);
            }
        })

    })
}

function pathSep(p) {
    return p.replace(/\\+/g, "/").replace(/[\r\n\s]+$/, "");
}


module.exports = main;
