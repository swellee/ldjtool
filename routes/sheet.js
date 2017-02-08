var xlsx = require("node-xlsx");
var path = require("path");
var fs = require("fs");
var util = require("./util");

var outJson = {}; //记录合并导出json obj
var sheetHeads = 3; //表头所占据的行数
var outFileName = "tpl.json"; //合并导出的文件名
var sheetTags = {
    client: "CLIENT",
    server: "SERVER",
    double: "DOUBLE",
    no: "NO"
};
var nameIgnore = "NO";
var nameTags = {
    client: ".C",
    server: ".S",
}

var cfg; //read config
var inDir;
var outDir;

//-------------enter---------------------------------
function main(usrCfg, cmds) {
    cfg = usrCfg;
    inDir = cfg.excelInDir;
    outDir = cfg.excelOutDir;

    if (cmds) {
        if (cmds.length)
            inDir = cmds.shift();
        if (cmds.length)
            outDir = cmds.shift();
    }
    process.chdir(inDir);
    fs.readdir(inDir, listFiles);
}

function listFiles(err, files) {
    if (err) {
        util.err(err);
    }
    //如果未配置输出目录，则输出到当前位置的output文件夹下
    if (!outDir) {
        outDir = path.resolve("./output");
    }
    //如果导出目录不存在，则创建
    util.mkdirs(outDir, function() {
        for (var i in files) {
            parseFile(files[i]);
        }
        //写入文件
        var outStr = JSON.stringify(outJson); //导出json
        var outFile = path.resolve(outDir, outFileName);
        fs.appendFile(outFile, outStr, { flag: "w" }, function(err) {
            if (err) {
                error(err);
            }
        });
    });
}

function parseFile(fl) {
    var extName = path.extname(fl);
    var flPath = path.resolve(inDir, fl);
    if (/^[a-zA-Z]+/.test(fl) == false) {
        return;
    }
    if (extName == ".xlsx") {
        var sheets = xlsx.parse(flPath);
        //先筛选出有效的工作表
        var validSheets = {};
        for (var i = 0; i < sheets.length; i++) {
            var sht = sheets[i];
            if (/Sheet[0-9]+/.test(sht.name)) {
                continue;
            }
            if (sht.data.length < 2) {
                continue;
            }
            if (validSheets[sht.name]) {
                util.err(fl + 　"中出现了已存在过的导出表名>>" + sht.name);
            } else {
                validSheets[sht.name] = sht.data;
                mergeToJson(sht.data, sht.name, flPath);
            }
        }
    } else if (fl == "SceneTemplate.xml") {
        //将地编生成的配置文件，也并到tpl.json里
        var xml = require("pixl-xml");
        var data = xml.parse(flPath);
        var scene = {};
        for (var node in data) {
            if (data[node].constructor == Array) {
                var list = data[node];
                for (var i = 0; i < list.length; i++) {
                    var sceneCfg = list[i];

                    var obj = {};
                    for (var key in sceneCfg) {
                        var oKey = key.toLowerCase();
                        var oVal = sceneCfg[key];
                        if (oKey == "sceneid") {
                            oKey = "id";
                        } else if (oKey == "maskdata") {
                            oKey = "mask";
                        } else if (oKey == "image") {
                            oKey = "img";
                            oVal = oVal.split(".")[0];
                        } else if (oKey == "width" || oKey == "height") {
                            oVal = parseInt(oVal);
                        }
                        obj[oKey] = oVal;
                    }
                    scene[obj.id] = obj;
                }
                outJson.scene = scene;
            }
        }
    }
}

function mergeToJson(sht, name, fl) {
    //sht==其中一个工作表的内容
    //检测该表是否有内容
    if (sht.length <= sheetHeads) {
        return;
    }

    var shtFlag = sht[0][0]
    if (!shtFlag || (shtFlag != sheetTags.client && shtFlag != sheetTags.double)) {
        return; //目前只处理客户端表
    }
    //先读掉前几行配置、类型、注释等
    outJson[name] = {};
    var shtHeads = sht.slice(0, sheetHeads); //表头
    data = sht.slice(sheetHeads); //数据
    var colFlags = shtHeads[0]; //字段导出标识
    var colComments = shtHeads[1]; //中文字段名
    var colNames = shtHeads[2]; //字段名
    //确定有效数据的起始列索引
    var colStart = 0;
    while (!colNames[colStart] && colStart < 9) {
        colStart++;
    }

    //每行数据生成一个包装单元
    for (var i in data) {
        var cell = {};
        var line = data[i];

        for (var k = colStart; k < colNames.length; k++) {
            var clName = colNames[k];
            var clFlag = colFlags[k];
            //字段过滤
            if (clName && clFlag && (clFlag != nameIgnore || clFlag.indexOf(nameTags.server) == -1)) {
                var clData = line[k];
                cell[clName] = parseType(clFlag, clData);
            }

        }
        if (line[colStart]) {
            outJson[name][line[colStart]] = cell;
        }
    }
}

function parseType(type, data) {
    if (type.indexOf("STRING") != -1) {
        return data? (data + ""):"";
    } else if (type.indexOf("INT") != -1 || type.indexOf("NUMBER") != -1) {
        return parseInt(data);
    }
}

module.exports = main;
