/**
 * Created by swellee on 2016/9/19.
 * use as a forked node process;
 */
var xml = require("pixl-xml");
var path = require("path");
var fs = require("fs");
var util = require("./util");
var os = require("os");
var validResTyes = "jpg,png";
var userCfgDir = path.join(os.homedir(), ".ldjtool");
var cfg = require(path.join(userCfgDir, "cfg.json"));
// var rule = require(path.join(userCfgDir, "ui_rule.json"));
var rule = require(path.join(cfg.clientDir, ".ui_rule.json"));

var baseUiPackDir = path.resolve(cfg.clientDir, "src/app/modules");
var sh = require("child_process");

var paras = process.argv;
var file = paras.pop();
var dir = path.dirname(file);
var dirName = path.basename(dir);
var actTask = 0; //活动任务数
parseUI(file);


function parseUI(file) {
    if (path.extname(file) != ".xml") {
        process.send("跳过非xml文件" + file);
        return;
    }
    actTask++;
    var content = fs.readFileSync(file, {
        encoding: "utf8"
    });
    var idx = 0; //按节点，借用layer属性，进行节点的显示排序，因为MornUI在保存文件时，只通过节点顺序标识组件显示层级，xml解析后可能打乱节点
    content = content.replace(/layer=\"[0-9]\"/g, function() {
        return 'layer="' + (idx++) + '"';
    });
    try {
        var xmlData = xml.parse(content, {
            preserveAttributes: true,
            preserveDocumentNode: true
        });
    } catch (e) {
        process.send("已跳过异常文件：" + file + "\n" + e);
        return;
    }

    ///-----------------解析分类----------------------------------
    var imports = {}; //通过key来记录导包并去重
    var res = {}; //通过key来记录资源和去重
    var usedTempDefine = {
        "var": true
    }; //已经使用过的局部变量名
    var declares = {}; //记录变量声明
    var fileName = path.basename(file, ".xml");
    var creates = [];
    var rootName = Object.keys(xmlData)[0]; //根容器，用于生成父类名
    var rootNode = xmlData[rootName];
    rootNode["_Attribs"].var = '';
    var lists = [];
    listNodes("this", rootName, rootNode, lists, rootName, declares, usedTempDefine);
    parseNode(lists, imports, res, declares, creates, usedTempDefine);

    ///-----------------解析完成----------------------------------
    ///-----------------按结构导出--------------------------------
    //生成UI类
    genUIfile(fileName, "", rootName, imports, declares, res, creates);
    //生成逻辑类
    genLgFile(fileName, fileName + "UI", "", rule.noCallCreateChildren[rootName] ? "" : "createChildren");

    //拷贝使用了的资源到bin/h5/assets/下对应模块目录
    var cmd = "cp";
    sh.exec("ls", function(err, stdout, stderr) {
        if (err) {
            cmd = "copy"; //windows
        }
    });
    for (var key in res) {
        if (key.indexOf("/comp/") != -1) {
            //跳过默认组件资源
            continue;
        }
        var rP = key.replace(/("|')/g, '');
        var resP = path.resolve(cfg.baseUiFileDir, "../", rP.replace("img", ""));
        var toP = path.resolve(cfg.clientDir, "bin/h5", rP);
        //如果是btn，则尝试拷贝其多态皮肤
        if (resP.indexOf("btn_") != -1) {
            var bsname = path.basename(resP);
            var ddname = path.dirname(resP);
            var bsname2 = bsname.replace(/\d$/, function(str) {
                return str == "0" ? "1" : "0";
            });
            var btnres2 = resP.replace(bsname, bsname2);
            var btnto2 = toP.replace(bsname, bsname2);
            copyres(cmd, btnres2, btnto2);
        }
        //
        copyres(cmd, resP, toP);
    }

}

function copyres(cmd, resP, toP) {
    try { sh.execSync(`${cmd} ${resP} ${toP}`); } catch (e) {
        console.log(`警告：拷贝UI文件>>${file}的资源出错, 你可能需要手动拷贝该资源到客户端项目下的同名目录里！`)
    }
}

function getPackName(file) {
    var dname = path.dirname(file);
    dname = dname.split(cfg.baseUiPackRootName + path.sep)[1];
    var pks = dname.split(path.sep).join(".").toLowerCase();
    return cfg.baseUiPackgeIdr + pks;
}


function getDeclare(declares) {
    var arr = [];
    for (var key in declares) {
        arr.push({ dfine: key, type: declares[key] })
    }
    return arr;
}

function quote(str) {
    return "'" + str + "'";
}

function listNodes(parentName, nodeName, nodeData, list, rootName, declares, usedTempDefine) {

    parentName = parentName == rootName.toLowerCase() ? "this" : parentName;

    if (nodeData["_Attribs"]) {
        var attrs = nodeData["_Attribs"];
        var rec = recDefine(nodeName, attrs, declares, usedTempDefine);
        //本节点数据
        list.push({
            parentName: parentName,
            nodeName: nodeName,
            nodeData: nodeData,
            define: rec.define,
            clazz: rec.clazz
        });

        if (nodeData["_Attribs"]["name"]) {
            //需要作为子类导出的节点数据
            if (rule.specialAttr.name[nodeName]) {
                var nameRule = rule.specialAttr.name;
                if (nameRule[nodeName] && nameRule[nodeName]["type"] && nameRule[nodeName]["type"] == "childClass") {
                    return;
                }
            }
        }

        //其他同级数组节点或子节点，递归
        for (var key in nodeData) {
            if (key == "_Attribs") {
                continue;
            }

            var node = nodeData[key];
            if (node.constructor == Array) {
                for (var i in node) {
                    listNodes(rec.define, key, node[i], list, rootName, declares, usedTempDefine);
                }
            } else {
                listNodes(rec.define, key, node, list, rootName, declares, usedTempDefine);
            }
        }

    }

}



function parseNode(nodeLists, imports, res, declares, creates, usedTempDefine) {
    nodeLists.sort(function(a, b) {
        if (a.nodeData["_Attribs"] && b.nodeData["_Attribs"]) {
            return a.nodeData["_Attribs"].layer - b.nodeData["_Attribs"].layer;
        }
        return 0;
    });
    for (var i = 0; i < nodeLists.length; i++) {
        var node = nodeLists[i];

        var parentNodeName = node.parentName;
        var nodeName = node.nodeName;
        var nodeData = node.nodeData;
        var clazz = nodeName;
        if (clazz && rule.specialClass[nodeName]) {
            clazz = rule.specialClass[nodeName]; //特殊的类映射
        }
        var funcs = {};
        var props = {};
        //处理当前节点的属性
        var attrs = nodeData["_Attribs"];
        var dfine = node.define;
        var clazz = node.clazz;
        for (var attKey in attrs) {
            var attValue = attrs[attKey];
            //需要特殊处理的属性
            if (rule.specialAttr.hasOwnProperty(attKey)) {
                var specialRule = rule.specialAttr[attKey];
                if (!specialRule) {
                    //特殊规则为空，表示丢弃该属性
                    continue;
                }
                if (attKey == "var") {
                    continue; //变量名已经在前面处理过了
                }

                //映射为类
                if (attKey == "name") {
                    if (specialRule[nodeName]) {
                        var nameRule = specialRule[nodeName];
                        //将子对象映射为类
                        if (nameRule["type"] && nameRule.type == "childClass") {
                            //兼容老的规则，老规则默认只生成ItemRenderer子类
                            var names = attValue.trim().split(":"); //eg. pack.className:baseClassName:false
                            var pkfile = names[0].split(".");
                            var packName = names.length > 1 && pkfile.length > 1 ? pkfile[0] : "renderer";
                            var fileName = names.length > 1 && pkfile.length > 1 ? pkfile[1] : names[0] + "ItemRenderer";
                            var rootName = names.length > 1 ? names[1] : "ItemRenderer";
                            var needOverridePrefix = names.length > 2 ? (names[2] == "true") : true; //是否需要对createChildren添加oveerride前缀，默认true
                            if (nameRule["prop"]) {
                                specialRule = nameRule.prop;
                                props[specialRule] = fileName;
                                //将子类包引入
                                var dname = path.dirname(file);
                                dname = dname.split(cfg.baseUiPackRootName)[1].substr(1);
                                var pks = dname.split(path.sep).join(".").toLowerCase();
                                var ipt = cfg.baseUiPackgeIdr + pks + ".view." + packName + "." + fileName;
                                imports[ipt] = true;
                                rule.overrideCreateChildren[rootName] = needOverridePrefix;
                            }
                            if (nameRule["addProp"]) {
                                var adds = nameRule["addProp"];
                                for (var ad in adds) {
                                    props[ad] = adds[ad];
                                }
                            }
                            //生成子类代码
                            parseChildUI(packName, fileName, rootName, nodeData, res);
                        }
                        //将name作为属性处理
                        else if (nameRule["type"] == "prop") {
                            recProps(nameRule["prop"], attValue, props, res, true);
                        }
                    }
                }
                //带过滤的特殊属性转换
                else if (specialRule.hasOwnProperty("when")) {
                    if (specialRule.when.indexOf(clazz) != -1) {
                        recProps(specialRule.prop, attValue, props, res);
                    } else {
                        recProps(attKey, attValue, props, res);
                    }
                } else {
                    var sp = specialRule.lastIndexOf("_");
                    if (sp != -1) {
                        var funName = specialRule.substring(0, sp);
                        var paraIdx = specialRule.substr(sp + 1);
                        if (!funcs[funName]) {
                            funcs[funName] = [];
                        }
                        var num = parseInt(attValue);
                        if (!isNaN(num)) { //能作为数字的，转为数字
                            attValue = num;
                        }
                        funcs[funName][paraIdx] = attValue;

                    } else {

                        recProps(specialRule, attValue, props, res);
                    }
                }

            }
            //普通setter属性
            else {
                recProps(attKey, attValue, props, res);
            }
        }

        ///-------------生成-----------------
        if (clazz) {
            //imports
            var ipt = rule.import[clazz] || rule.import.default;
            ipt = (ipt + "." + clazz).replace("..", ".");
            imports[ipt] = true;
            if (i == 0) {
                continue; //节点0是最外层，不生成
            }
            //self class
            var skipVar = false;
            if (declares.hasOwnProperty(dfine)) {
                skipVar = true;
            }

            creates.push((skipVar ? dfine : "var " + dfine + ":" + clazz) + " = new " + clazz + "();");
            if (declares.hasOwnProperty(dfine)) {
                creates.push(dfine + ".name = " + quote(dfine) + ";");
            }
        }

        //调用函数
        for (var f in funcs) {
            var fn = f.split("_");
            var fname = fn[0];
            var pcount = fn[1];
            for (var pp = 0; pp < pcount; pp++) {
                funcs[f][pp] = funcs[f][pp] || 0; //若无完整的参数量，则补0
            }
            creates.push(dfine + "." + fname + "(" + funcs[f].join(",") + ");")
        }
        //其他属性
        for (var p in props) {
            creates.push(dfine + 　"." + p + " = " + props[p] + ";");
        }

        if (parentNodeName) {
            creates.push(parentNodeName + ".addChild(" + dfine + ");");
        }
        creates.push("\n");
    }
}


function recDefine(nodeName, attrs, declares, usedTempDefine) {
    var define = attrs["var"] || nodeName.toLowerCase();

    var clazz = nodeName;
    var needRec = true;
    if (attrs["name"] && !rule.specialAttr.name[nodeName]) {
        if (attrs["var"]) {
            define = attrs["var"];
        } else {
            needRec = false;
            define = attrs["name"].toLowerCase();
        }
        clazz = attrs["name"];
    } else if (attrs["var"]) {
        define = attrs["var"];
    } else {
        needRec = false;
    }

    if (rule.specialClass[clazz]) {
        clazz = rule.specialClass[clazz];
    }
    if (needRec) { //已命名的成员变量
        declares[define] = clazz;
    } else { //临时变量
        if (usedTempDefine.hasOwnProperty(define)) {
            var tempDf = define + "1";
            var renameDf = tempDf.replace(/[0-9]$/, function(tidx) {
                var tid = parseInt(tidx);

                while (usedTempDefine.hasOwnProperty(tempDf)) {
                    tid++;
                    tempDf = define + tid;
                }
                return tid;
            });
            define = renameDf;
        }
        usedTempDefine[define] = true;

    }

    return { define: define, clazz: clazz };
}

function recProps(attKey, attValue, props, res, force) {
    //-------处理attvalue---------
    //颜色统一使用web形式
    attValue = attValue.replace(/^(0[xX])/g, "#");
    if (/^\d+(\.\d+)?$/.test(attValue)) {
        //十进制数字
        var num = parseFloat(attValue);
        if (!isNaN(num)) {
            attValue = num;
        }
    } else if (attValue == "true" || attValue == "false") {
        //布尔值
        attValue = Boolean(attValue == "true");
    }
    //---------------------------
    else {
        //作为字符串处理
        attValue = attValue.replace(/\s/g, '');
        if (attKey == "sizeGrid") {
            //编辑器里是 左 上 右 下，需要转成 上 右 下左
            var grids = attValue.split(",");
            if (grids.length > 3)
                attValue = quote([grids[1], grids[2], grids[3], grids[0]].join(","));
            else
                attValue = quote(attValue);
        } else if (attKey == "skin") {
            //标记资源
            var attFix = attValue.split(".");
            var tail = attFix.shift();
            if (validResTyes.indexOf(tail) != -1) {
                attValue = quote("assets/img/" + attFix.join("/") + "." + tail);
                res[attValue] = true;
            }
        } else {
            attValue = quote(attValue); //包一层引号
        }

    }

    //--------记录key-value-----
    if (!props[attKey] || force) {
        props[attKey] = attValue;
    }
}


function parseChildUI(packName, fileName, rootName, nodeData, res) {
    ///-----------------解析子类----------------------------------
    var imports = {}; //key记录导包信息
    var declares = {}; //记录变量声明
    var creates = [];
    var usedTempDefine = {
        "var": true
    }; //已经使用过的局部变量名
    var lists = [];
    nodeData["_Attribs"].name = rootName;
    nodeData["_Attribs"].var = '';
    listNodes("this", rootName, nodeData, lists, rootName, declares, usedTempDefine);
    parseNode(lists, imports, res, declares, creates, usedTempDefine);
    ///-----------------按结构导出UI类--------------------------------
    genUIfile(fileName, packName, rootName, imports, declares, null, creates);

    //生成逻辑类
    genLgFile(fileName, fileName + "UI", packName, rule.noCallCreateChildren[rootName] ? "" : "createChildren");
}
//生成UI类
function genUIfile(fileName, packName, rootName, imports, declares, res, creates) {
    var clzNm = fileName + "UI";

    var filePath = path.join(dir, "view", packName, fileName);
    //生成UI类
    var clzNm = fileName + "UI";
    var dustData = {
        pack: getPackName(filePath),
        imports: Object.keys(imports),
        className: clzNm,
        declares: getDeclare(declares),
        rootName: rootName,
        creates: creates,
        createFunType: rule.overrideCreateChildren[rootName] ? "override protected" : '',
        ui: true
    }
    if (res) {
        dustData.res = Object.keys(res);
        dustData.genRes = true;
    }

    util.dust("ui", dustData, function(out) {
        writeTo(path.resolve(baseUiPackDir, dirName, "view", packName, clzNm + ".as"), out);
    })
}

//生成UI逻辑类
function genLgFile(fileName, rootName, packName, superCall) {
    var filePath = path.join(dir, "view", packName, fileName);
    var logicFile = path.resolve(baseUiPackDir, dirName, "view", packName, fileName + ".as");
    fs.access(logicFile, fs.R_OK, (err) => {
        if (err) {
            var lgData = {
                pack: getPackName(filePath),
                className: fileName,
                rootName: rootName,
                superCall: superCall
            }

            util.dust("ui", lgData, function(out) {
                writeTo(logicFile, out);
            })
        }
    });
}

function writeTo(filePath, data) {
    var rpath = path.relative(baseUiPackDir, filePath).toLowerCase();
    var idx = rpath.lastIndexOf("." + path.sep) + 1;
    var delta = path.dirname(rpath.substring(idx));
    var targetDir = path.join(baseUiPackDir, delta);
    util.mkdirs(targetDir, function() {
        fs.appendFile(filePath, data, {
            flag: "w"
        }, function(err) {
            if (err) {
                util.err(err);
            } else {
                if (--actTask <= 0) {
                    process.send("ok"); //通知父进程，此操作已完成
                }
            }
        })
    })
}

module.exports = parseUI;
