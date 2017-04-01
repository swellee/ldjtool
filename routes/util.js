/**
 * Created by swellee on 2016/9/26.
 */
var fs = require("fs");
var path = require("path");
var dust = require('dustjs-linkedin');
var hash = require('crypto');

function mkdirs(dirpath, callback) {
	dirpath = path.resolve(dirpath)
	fs.access(dirpath, fs.F_OK, function(err){
		if (err) {
				var cmd = "mkdir -p " + dirpath;
			    require("child_process").execSync(cmd);
		}
		callback && callback();

	})
	
}

function errOut(msg) {
    console.log(msg + "\n-------------按回车键退出---------------");
    process.stdin.resume();
    process.stdin.on("data", function (chunk) {
        process.exit(1);
    });
}

function loadDustTemplate(name) {
    var template = fs.readFileSync(path.resolve(__dirname , "../tpl/" , name + ".dust"), "UTF8").toString();
    var compiledTemplate = dust.compile(template, name);
    dust.loadSource(compiledTemplate);
}

function compileTpl(tplName, data, callback) {
	loadDustTemplate(tplName);
	dust.render(tplName,data, function(err, out){
		if (err){
			errOut();
		}
		callback(out);
	});
}
var runningHash = 0;
var hashReqs = [];
function getFileHash(file) {
    var content = fs.readFileSync(file);
    var md5 = hash.createHash("md5");
    md5.update(content);
    return md5.digest("hex");
}


exports.mkdirs = mkdirs;
exports.err = errOut;
exports.dust = compileTpl;
exports.hash = getFileHash;