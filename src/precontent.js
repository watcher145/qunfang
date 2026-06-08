import { lib } from "noname";
import { characterSubstitute } from "./character/characterSubstitute.js";
import dynamicTranslates from "./translate/dynamicTranslate.js";

/**
 * 扩展加载时执行：可在此注册 lib.namePrefix、合并 lib.dynamicTranslate 等
 */
export function precontent() {
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
