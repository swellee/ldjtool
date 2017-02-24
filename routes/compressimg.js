/**
 * Created by swellee on 2017/2/15.
 */
var os = require("os");
var path = require("path")
var fs = require("fs");
var sh = require("child_process");
var util = require("./util");
var cfg = require(path.join(os.homedir(), ".ldjtool", "cfg.json"));
var resPath;//项目资源路径
var hashPath;//资源hash文件路径
var resHash;//资源hash记录

const IMAGE_FILE = {".png":true, ".jpg":true}
const FORK_CNT = 8;
var forkCnt = 0;
var resQueue = [];

function start(prjPath) {
    prjPath = prjPath || cfg.clientDir;
    resPath = path.join(prjPath,"bin/h5/assets");
    hashPath = path.join(prjPath, ".resHash.json");

    console.log("开始压缩图片资源...")
    fs.access(hashPath, fs.R_OK || fs.constants.R_OK, function (err) {
        if (err) {
            //no hash file
            resHash = {};
        }
        else {
            resHash = require(hashPath);
        }
        var files = fs.readdirSync(resPath);
        ergoDir(files, resPath);

        compress();
    })


}

function ergoDir(files, curPath) {
    files.forEach(function (fl) {
        fl = path.join(curPath, fl);
        var st = fs.statSync(fl);
        if (st.isDirectory()) {
            var subFiles = fs.readdirSync(fl);
            ergoDir(subFiles, fl);
        }
        else {
            var extNm = path.extname(fl);
            if(IMAGE_FILE[extNm]) {
                var key = fl.split("assets")[1].replace(new RegExp(path.sep, "g"), "_");
                var v = util.hash(fl);

                if (resHash[key] != v ) {
                    resQueue.push({file:fl, ext:extNm.substr(1),key:key});
                }

            }
        }
    })
}

function compress() {
    if (forkCnt < FORK_CNT && resQueue.length) {
        forkCnt++;
        var fl = resQueue.pop();
        var cmd = fl.ext == "jpg" ? ("jpegoptim -m50 " + fl.file) : ("pngquant --ext .png --force " + fl.file);
        console.log("compress>>",fl.file);
        var p = sh.exec(cmd, function (err, stdout, stderr) {
            if (err) {
                console.log(err);
            }
            forkCnt--;

            var flNewKey = util.hash(fl.file);
            resHash[fl.key] = flNewKey;
            console.log(fl.key, flNewKey);

            compress();
        })
    }
    else if (forkCnt <= 0) {
        fs.appendFile(hashPath, JSON.stringify(resHash), {flag:"w"}, function (err) {
            if (err) {
                console.log("写入资源hash出错",err);
            }
            else {
                console.log("压缩图片资源完成！");
            }
        })
    }
}




module.exports = start;
