/**
 * Created by swellee on 2016/9/19.
 * use as a forked node process;
 */
var xml = require("pixl-xml");
var path = require("path");
var fs = require("fs");
var util = require("./util");
var os = require("os");
var cfg = require(path.join(os.homedir(), ".ldjtoolCfg.json"));
var rule = require(path.join(os.homedir(), ".ldjtoolUIRule.json"));
var baseUiPackDir = path.resolve(cfg.clientDir, "src/ghostcoming/modules");
var sh = require("child_process");

var paras = process.argv;
var file = paras.pop();
var dirName = path.basename(path.dirname(file));
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
    var creatObjs = {
        str: ""
    };
    var rootName = Object.keys(xmlData)[0]; //根容器，用于生成父类名
    var rootNode = xmlData[rootName];
    rootNode["_Attribs"].var = '';
    var lists = [];
    listNodes("this", rootName, rootNode, lists);
    parseNode(lists, imports, res, declares, creatObjs, usedTempDefine);
    ///-----------------解析完成----------------------------------
    ///-----------------按结构导出--------------------------------
    var clzNm = fileName + "UI";
    var out = "//This code is auto generated and will be replaced, so don't edit it.\n" +
        getPackName(file, ".view") +
        getImports(imports) +
        getClassHead(clzNm, rootName, "internal") +
        getDeclare(declares) +
        getConstructor(clzNm) +
        getCreates(creatObjs, rootName) +
        getRes(res) + "\n\t}" //class over
        + "\n}" //pack over;
    writeTo(path.resolve(baseUiPackDir, dirName, "view", clzNm + ".as"), out);
    //生成对应的逻辑类
    var logicFile = path.resolve(baseUiPackDir, dirName, "view", fileName + ".as");
    fs.access(logicFile, fs.R_OK, (err) => {
        if (err) {
            var logicOut = getPackName(file, ".view") +
                getClassHead(fileName, clzNm, "public") +
                getConstructor(fileName, "createChildren();") +
                "\n\t}" //class over
                + "\n}" //pack over;

            writeTo(logicFile, logicOut);
        }
    });

    //拷贝使用了的资源到bin/h5/assets/下对应模块目录
    var cmd = "cp";
    sh.exec("ls", function(err, stdout, stderr) {
        if (err) {
            cmd = "copy"; //windows
        }
    });
    for (var key in res) {
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

function getPackName(file, addition) {
    var dname = path.dirname(file);
    dname = dname.split(cfg.baseUiPackRootName + path.sep)[1];
    var pks = dname.split(path.sep).join(".").toLowerCase();
    return "package " + cfg.baseUiPackgeIdr + pks + addition + " {\n";
}

function getImports(imports) {
    var str = "";
    for (var key in imports) {
        str += "\timport " + key + ";\n";
    }
    return str;
}

function getClassHead(clazzName, root, scope) {
    return `\t${scope} class ${clazzName} extends ${root}\n\t{\n`;
}

function getDeclare(declares) {
    var str = "";
    for (var key in declares) {
        str += "\t\tprotected var " + key + ":" + declares[key] + ";\n";
    }
    return str;
}

function getConstructor(name, insert) {
    return "\t\tpublic function " + name + "()\n" + 　"\t\t{\n\t\t\tsuper();" +
        (insert ? ("\n\t\t\t" + insert) : "") +
        "\n\t\t}\n";
}

function getCreates(creatObjs, baseClass) {
    var prefix = '';
    if (rule.overrideCreateChildren[baseClass]) {
        prefix = "override ";
    }
    return "\t\t" + prefix + "protected function createChildren():void\n\t\t{\n" + creatObjs.str + "\t\t}\n";
}

function getRes(res) {
    if (Object.keys(res).length == 0) {
        return "\t\tprotected static const SKIN_RES:Array = [];\n";
    }
    var str = "\t\tprotected static const SKIN_RES:Array = [\n";
    for (var key in res) {
        str += '\t\t\t' + key + ',\n';
    }
    return str.substr(0, str.length - 2) + "\n\t\t];\n";
}

function quote(str) {
    return "'" + str + "'";
}

function listNodes(parentName, nodeName, nodeData, list) {
    var pName = parentName == "this" ? parentName : nodeName;
    if (nodeData["_Attribs"]) {
        //需要作为子类导出的节点数据
        if (nodeData["_Attribs"]["name"]) {
            var nm = nodeData["_Attribs"]["name"];
            if (rule.specialAttr.name[nodeName]) {
                var nameRule = rule.specialAttr.name;
                if (nameRule[nodeName] && nameRule[nodeName]["type"] && nameRule[nodeName]["type"] == "childClass") {
                    list.push({
                        parentName: parentName,
                        nodeName: nodeName,
                        nodeData: nodeData
                    });
                    return;
                }
            }
        }
        //本节点有变量名
        if (nodeData["_Attribs"]["var"]) {
            pName = nodeData["_Attribs"]["var"];
        }

    }

    //正常的节点数据
    for (var key in nodeData) {
        //本节点数据
        if (key == "_Attribs") {
            list.push({
                parentName: parentName,
                nodeName: nodeName,
                nodeData: nodeData
            });
            continue;
        }

        var node = nodeData[key];
        //子节点
        //列表
        if (node.constructor == Array) {
            for (var i in node) {
                listNodes(pName, key, node[i], list);
            }
        }
        //其他元素
        else {
            listNodes(pName, key, node, list);
        }
    }

}

function parseNode(nodeLists, imports, res, declares, createStrObj, usedTempDefine) {
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
        var dfine = nodeName.toLowerCase();
        var funcs = {};
        var props = {};
        //处理当前节点的属性
        var attrs = nodeData["_Attribs"];
        var rec = recDefine(dfine, nodeName, attrs, declares, i != 0);
        dfine = rec.define;
        clazz = rec.clazz;
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
                //作为函数处理
                else if (specialRule.indexOf("_") != -1) {
                    var sp = specialRule.lastIndexOf("_");
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
                }
                //需要转换的setter属性
                else {
                    recProps(specialRule, attValue, props, res);
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
            if (usedTempDefine.hasOwnProperty(dfine) || declares.hasOwnProperty(dfine)) {
                skipVar = true;
            }
            if (!skipVar) {
                usedTempDefine[dfine] = true;
            }
            createStrObj.str += "\t\t\t" + (skipVar ? dfine : "var " + dfine + ":" + clazz) + " = new " + clazz + "();\n";
            if (declares.hasOwnProperty(dfine)) {
                createStrObj.str += "\t\t\t" + dfine + ".name = " + quote(dfine) + ";\n";
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
            createStrObj.str += "\t\t\t" + dfine + "." + fname + "(" + funcs[f].join(",") + ");\n";
        }
        //其他属性
        for (var p in props) {
            createStrObj.str += "\t\t\t" + 　dfine + 　"." + p + " = " + props[p] + ";\n";
        }

        if (parentNodeName) {
            createStrObj.str += "\t\t\t" + parentNodeName + ".addChild(" + dfine + ");\n";
        }

        createStrObj.str += "\n";
    }
}

function recDefine(define, nodeName, attrs, declares, needRec) {
    var rec = {
        define: define,
        clazz: nodeName
    }
    if (attrs["name"] && !rule.specialAttr.name[nodeName]) {
        if (attrs["var"]) {
            rec.define = attrs["var"];
        } else {
            needRec = false;
            rec.define = attrs["name"].toLowerCase();
        }
        rec.clazz = attrs["name"];
    } else if (attrs["var"]) {
        rec.define = attrs["var"];
    } else {
        needRec = false;
    }

    if (rule.specialClass[rec.clazz]) {
        rec.clazz = rule.specialClass[rec.clazz];
    }
    if (needRec) {
        declares[rec.define] = rec.clazz;
    }
    return rec;
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
            attValue = quote("assets/img/" + attFix.join("/") + "." + tail);
            res[attValue] = true;
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
    var creatObjs = {
        str: ""
    };
    var usedTempDefine = {
        "var": true
    }; //已经使用过的局部变量名
    var lists = [];
    nodeData["_Attribs"].name = rootName;
    nodeData["_Attribs"].var = '';
    listNodes("this", rootName, nodeData, lists);
    parseNode(lists, imports, res, declares, creatObjs, usedTempDefine);
    ///-----------------按结构导出UI类--------------------------------
    var clzNm = fileName + "UI";
    var dir = path.dirname(file);
    var filePath = path.join(dir, "view", packName, fileName);
    var out = "//This code is auto generated and will be replaced, so don't edit it.\n" +
        getPackName(filePath, '') +
        getImports(imports) +
        getClassHead(clzNm, rootName, "public") +
        getDeclare(declares) +
        getConstructor(clzNm) +
        getCreates(creatObjs, rootName) +
        "\n\t}" //class over
        + "\n}" //pack over;
    writeTo(path.resolve(baseUiPackDir, dirName, "view", packName, clzNm + ".as"), out);

    //----------------生成对应的逻辑类---------------------------------
    var logicFile = path.resolve(baseUiPackDir, dirName, "view", packName, fileName + ".as");
    fs.access(logicFile, fs.R_OK, (err) => {
        if (err) {
            var logicOut = getPackName(filePath, '') +
                getClassHead(fileName, clzNm, "public") +
                getConstructor(fileName, "createChildren();") +
                "\n\t}" //class over
                + "\n}" //pack over;

            writeTo(logicFile, logicOut);
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
