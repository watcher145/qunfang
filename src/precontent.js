import { lib } from "noname";
import { characterSubstitute } from "./character/characterSubstitute.js";
import dynamicTranslates from "./translate/dynamicTranslate.js";

/**
 * 扩展加载时执行：可在此注册 lib.namePrefix、合并 lib.dynamicTranslate 等
 */
export function precontent() {
	lib.namePrefix.set("飘萍", {
		color: "#7A93A1",
		nature: "watermm",
	});
	lib.namePrefix.set("蒂莲", {
		color: "#4DB6AC",
		nature: "watermm",
	});
	lib.namePrefix.set("烈蕙", {
		color: "#C62828",
		nature: "watermm",
	});
	lib.namePrefix.set("毒菟", {
		color: "#7E57C2",
		nature: "watermm",
	});
	lib.namePrefix.set("芳葇", {
		color: "#E9A8B9",
		nature: "watermm",
	});
	lib.translate.qunfang_meiying ??= "梅影";
	lib.translate.qunfang_meiying_bg ??= "影";
	lib.dynamicTranslate ??= {};
	for (const key of Object.keys(dynamicTranslates)) {
		if (!lib.dynamicTranslate[key]) {
			lib.dynamicTranslate[key] = dynamicTranslates[key];
		}
	}
	lib.characterSubstitute ??= {};
	for (const key of Object.keys(characterSubstitute)) {
		lib.characterSubstitute[key] = characterSubstitute[key];
	}
}
