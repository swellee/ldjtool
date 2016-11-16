/**
 * Created by swellee on 2016/9/26.
 */
var fs = require("fs");
var path = require("path");
var dust = require('dustjs-linkedin');

function mkdirs(dirpath, callback) {
	dirpath = path.resolve(dirpath)
	fs.access(dirpath, fs.F_OK, function(err){
		if (err) {
				var cmd = process.platform == "win32" ? ("mkdir " + dirpath) : ("mkdir -p " + dirpath)
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

exports.mkdirs = mkdirs;
exports.err = errOut;
exports.dust = compileTpl;