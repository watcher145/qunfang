import { getPackage } from "./src/package.js";
import { precontent } from "./src/precontent.js";

export const type = "extension";

export default function () {
	return {
		name: "群芳",
		editable: true,
		connect: false,
		arenaReady() {},
		content(config, pack) {},
		prepare() {},
		precontent,
		help: {},
		config: {},
		package: getPackage(),
		intro: "群芳扩展：在 src/character、src/skill、src/card、src/translate 中按模块添加内容。",
		author: "无名玩家",
		diskURL: "",
		forumURL: "",
		version: "1.0",
		files: {
			character: [
				"image/character/qunfang_sunshangxiang.jpg",
				"image/character/qunfang_sunshangxiang_shu.jpg",
				"image/character/qunfang_sunshangxiang_wu.jpg",
				"image/character/qunfang_zhaoxiang.jpg",
				"image/character/qunfang_xiahoushi.jpg",
				"image/character/qunfang_caiwenji.jpg",
			],
			card: ["image/card/qunfang_yiyi.jpg", "image/card/qunfang_toulianghuanzhu.jpg"],
			skill: [],
			audio: ["audio/die/qunfang_sunshangxiang.mp3"],
		},
	};
}
