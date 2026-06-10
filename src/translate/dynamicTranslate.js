import { lib, game, get } from "noname";
import { countLihuSkills, getLihuHandTarget } from "../skill/zhaoxiang.js";

const CARD_LABEL = {
	qunfang_yiyi: "以逸待劳",
	tuixinzhifu: "推心置腹",
	qunfang_toulianghuanzhu: "偷梁换柱",
};

const FUSHENG_SLOT_LABELS = {
	equip1: "武器栏",
	equip2: "防具栏",
	equip3: "防御坐骑栏",
	equip4: "进攻坐骑栏",
	equip5: "宝物栏",
};

function applyXiaoyinBaseMutations(player, base) {
	let text = base;
	if (player.storage.qunfang_xiaoyin_no_damage) {
		text = text.replace(/若此牌造成过伤害且此牌本轮未曾成为过"萧"/, '若此牌本轮未曾成为过"萧"');
	}
	if (player.storage.qunfang_xiaoyin_no_limit) {
		text = text.replace(/每回合限一次，/g, "");
	}
	return text;
}

function parseXiaoyinParts(text) {
	const zhuanMatch = text.match(/(\u003cb\u003e转韵\u003c\/b\u003e：.+。)$/);
	const zhuan = zhuanMatch?.[1] || "";
	const withoutZhuan = zhuanMatch ? text.slice(0, -zhuan.length) : text;
	const prefixMatch = withoutZhuan.match(/^([\s\S]*?)平：/);
	const prefix = prefixMatch?.[1] || withoutZhuan;
	const pingMatch = withoutZhuan.match(/平：([\s\S]*?)；/);
	const zeMatch = withoutZhuan.match(/仄：([\s\S]*?)；/);
	return {
		prefix,
		ping: pingMatch ? `平：${pingMatch[1]}；` : "",
		ze: zeMatch ? `仄：${zeMatch[1]}；` : "",
		zhuan,
	};
}

function getQunfangFushengDiscardText(player) {
	return player.storage.qunfang_fusheng_discard_count || 0;
}

function getQunfangDisabledSlotText(player) {
	const list = Array.from({ length: 5 })
		.map((_, index) => `equip${index + 1}`)
		.filter((slot) => player.hasDisabledSlot(slot))
		.map((slot) => FUSHENG_SLOT_LABELS[slot] || get.translation(slot));
	return list.length ? list.join("、") : "（无）";
}

function getQunfangUndiscardedOrdinaryTrickText(player) {
	const discarded = player.getStorage("qunfang_fusheng_discarded_names") || [];
	const list = get
		.inpileVCardList((info) => info[0] === "trick" && !discarded.includes(info[2]))
		.map((info) => get.translation(info[2]))
		.toUniqued();
	return list.length ? list.join("、") : "（无）";
}

export function getXiaoyinModeLine(player) {
	const base = applyXiaoyinBaseMutations(player, lib.translate.qunfang_xiaoyin_info || "");
	const { ping, ze } = parseXiaoyinParts(base);
	const isZe = !!player.storage.qunfang_xiaoyin;
	const cls = isZe ? "firetext" : "bluetext";
	const line = isZe ? ze : ping;
	return line ? `\u003cspan class="${cls}"\u003e${line}\u003c/span\u003e` : "";
}

function formatXiaoyinDescription(player) {
	const base = applyXiaoyinBaseMutations(player, lib.translate.qunfang_xiaoyin_info || "");
	const { prefix, ping, ze, zhuan } = parseXiaoyinParts(base);
	const isZe = !!player.storage.qunfang_xiaoyin;
	const pingLine = ping ? (isZe ? ping : `\u003cspan class="bluetext"\u003e${ping}\u003c/span\u003e`) : "";
	const zeLine = ze ? (isZe ? `\u003cspan class="firetext"\u003e${ze}\u003c/span\u003e` : ze) : "";
	return `${prefix}${pingLine}${zeLine}${zhuan}`;
}

function formatLuanpeiDescription(player) {
	const base = lib.translate.qunfang_luanpei_info || "";
	const isSha = !!player.storage.qunfang_luanpei;
	return base
		.replace(/①回复体力后/g, isSha ? "①回复体力后" : '\u003cspan class="bluetext"\u003e①回复体力后\u003c/span\u003e')
		.replace(/②使用【杀】指定目标后/g, isSha ? '\u003cspan class="firetext"\u003e②使用【杀】指定目标后\u003c/span\u003e' : "②使用【杀】指定目标后");
}

function formatFushengDescription(player) {
	const base = lib.translate.qunfang_fusheng_info || "";
	const isYin = !!player.storage.qunfang_fusheng;
	const text = base
		.replace(/阳：/g, isYin ? "阳：" : '\u003cspan class="bluetext"\u003e阳：\u003c/span\u003e')
		.replace(/阴：/g, isYin ? '\u003cspan class="firetext"\u003e阴：\u003c/span\u003e' : "阴：");
	const count = getQunfangFushengDiscardText(player);
	return `${text}\u003cbr\u003e当前累计牌数：${count}；触发所需：${player.maxHp}`;
}

function formatZhenzhiDescription(player) {
	const base = lib.translate.qunfang_zhenzhi_info || "";
	return `${base}\u003cbr\u003e当前已废除装备栏：${getQunfangDisabledSlotText(player)}\u003cbr\u003e当前可转化的未弃置普通锦囊：${getQunfangUndiscardedOrdinaryTrickText(player)}`;
}

const dynamicTranslates = {
	qunfang_lihu(player) {
		let base = lib.translate.qunfang_lihu_info || "";
		const mode = player.storage.qunfang_lihu_cost || "mark";
		if (mode === "hp") {
			base = base.replace(/1枚[“"]?梅影[”"]?标记/g, "1点体力");
		} else if (mode === "maxHp") {
			base = base.replace(/1枚[“"]?梅影[”"]?标记/g, "1点体力上限");
		}
		const skillNum = countLihuSkills(player);
		const hp = player.getHp();
		const target = getLihuHandTarget(player);
		const hand = player.countCards("h");
		return `${base}\u003cbr\u003e当前手牌数：${hand}（锁定技和无标签技能数${skillNum}+体力${hp}=${target}）`;
	},
	qunfang_yinji(player) {
		const base = lib.translate.qunfang_yinji_info || "";
		const key = player.storage.qunfang_yinji_card || "qunfang_yiyi";
		const label = CARD_LABEL[key] || get.translation(key);
		return base.replace(/【以逸待劳】/g, `【${label}】`);
	},
	qunfang_liubo(player) {
		let base = lib.translate.qunfang_liubo_info || "";
		if (player.storage.qunfang_liubo_no_basic) {
			base = base.replace(/，若此牌为基本牌，你令其摸一张牌或弃一张牌/g, "，你令其摸一张牌或弃一张牌");
		}
		if (player.storage.qunfang_liubo_no_equal) {
			base = base.replace(/，若你与其手牌数相等，你可以与其各摸一张牌/g, "，你可以与其各摸一张牌");
		}
		return base;
	},
	qunfang_xiaoyin(player) {
		return formatXiaoyinDescription(player);
	},
	qunfang_luanpei(player) {
		return formatLuanpeiDescription(player);
	},
	qunfang_xuansgui(player) {
		const base = lib.translate.qunfang_xuansgui_info || "";
		const names = player.getStorage("qunfang_xuansgui_names") || [];
		const nameStr = names.length ? names.map((n) => get.translation(n)).join("、") : "（无）";
		return `${base}\u003cbr\u003e已记录牌名：${nameStr}`;
	},
	qunfang_fusheng(player) {
		return formatFushengDescription(player);
	},
	qunfang_zhenzhi(player) {
		return formatZhenzhiDescription(player);
	},
};

export default dynamicTranslates;