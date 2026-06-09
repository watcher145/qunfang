import { characterData } from "./character/data.js";
import { characterTranslate } from "./character/translate.js";
import { characterTitle } from "./character/title.js";
import { characterIntro } from "./character/intro.js";
import { patchCharacterAssets } from "./character/patchAssets.js";
import { characterSubstitute } from "./character/characterSubstitute.js";
import { cardData } from "./card/data.js";
import { cardTranslate } from "./card/translate.js";
import { patchCardPackImages } from "./card/patchAssets.js";
import { skills } from "./skill/skills.js";
import { skillTranslate } from "./translate/skill.js";

function cloneAndPatchCharacters() {
	const o = {};
	for (const id of Object.keys(characterData)) {
		o[id] = { ...characterData[id] };
	}
	patchCharacterAssets(o);
	return o;
}

function cloneAndPatchCards() {
	const o = {};
	for (const name of Object.keys(cardData)) {
		o[name] = { ...cardData[name] };
	}
	patchCardPackImages(o);
	return o;
}

const characterSortTranslate = {
	qunfang_piaoping: "飘萍传",
	qunfang_dilian: "蒂莲传",
};

const characterSort = {
	qunfang_piaoping: ["qunfang_sunshangxiang", "qunfang_zhaoxiang", "qunfang_xiahoushi", "qunfang_caiwenji"],
	qunfang_dilian: ["qunfang_daqiao_xiaoqiao", "qunfang_wangtao_wangyue", "qunfang_liuling_liupei"],
};

/**
 * 无名杀扩展 package，结构与「奇臣传」「群友设计」一致
 */
export function getPackage() {
	return {
		character: {
			character: cloneAndPatchCharacters(),
			translate: { ...characterTranslate, ...characterSortTranslate },
			characterSort: {
				mode_extension_群芳: characterSort,
			},
			characterTitle: { ...characterTitle },
			characterIntro: { ...characterIntro },
			characterSubstitute: { ...characterSubstitute },
		},
		card: {
			card: cloneAndPatchCards(),
			translate: { ...cardTranslate },
			list: [],
		},
		skill: {
			skill: { ...skills },
			translate: { ...skillTranslate },
		},
	};
}
