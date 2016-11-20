**ludingji tool**
	基于laya的h5游戏ludingji的私用工具集合
#install
	npm i ldjtool -g

#use
	*ldjtool -h : 显示该使用说明;
	*ldjtool -a [laya_engine_src_path]: 在当前目录生成项目使用的.actionScriptProperties; -a后跟的参数为laya引擎的src代码路径，如果未给，则启用输入模式录入
	*ldjtool -m : 在项目目录下使用此命令，可更改项目的一些配置（如版本号等）
	*ldjtool -x [xlsx_in_path][xlsx_out_path]: 将配表转换成程序使用的文件，可选参数xlsx_in_path表示要处理的配表文件夹路径（不传则使用ldjtool -c配置的配表目录），
	*可选参数xlsx_out_path表示生成的tpl.json的存放目录（不传则使用ldjtool -c配置的放置目录）；
	*ldjtool -u [path or file] : 将指定目录下或指定的某个的mornUI生成的xml文件转换成as代码文件,不传路径则使用配置的baseUiFileDir路径；
	*ldjtool -ux : 添加UI解析时的 类名-包名 规则，以适应生成代码时对自定义类映射的支持；
	*ldjtool -uw : 监控UI文件目录的改动，自动重新生成UI代码；
	*ldjtool -b [projectDir] :编译项目；projectDir为项目路径，不传则使用当前路径（如果当前路径不是客户端目录，则会出错）
	*ldjtool -p [projectDir] [ver]:发布项目，projectDir为项目路径，不传则使用当前路径, 参数ver为版本号，不传则使用老的版本号，如果只传一个参数，则此参数当作版本号处理");