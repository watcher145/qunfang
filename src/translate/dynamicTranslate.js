import { lib, get } from "noname";
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
		text = text.replace(/若此牌造成过伤害且此牌本轮未曾成为过“萧”/g, '若此牌本轮未曾成为过“萧”');
		text = text.replace(/若此牌造成过伤害且此牌本轮未曾成为过"萧"/g, '若此牌本轮未曾成为过"萧"');
	}
	if (player.storage.qunfang_xiaoyin_no_limit) {
		text = text.replace(/每回合限一次，/g, "");
	}
	return text;
}

function parseXiaoyinParts(text) {
	const zhuanMatch = text.match(/(<b>转韵<\/b>：[\s\S]*)$/);
	const zhuan = zhuanMatch?.[1] || "";
	const withoutZhuan = zhuanMatch ? text.slice(0, -zhuan.length) : text;
	const prefixMatch = withoutZhuan.match(/^([\s\S]*?)平：/);
	const prefix = prefixMatch?.[1] || withoutZhuan;
	const pingMatch = withoutZhuan.match(/平：([\s\S]*?)(?=；仄：|$)/);
	const zeMatch = withoutZhuan.match(/仄：([\s\S]*)$/);
	return {
		prefix,
		ping: pingMatch ? `平：${pingMatch[1]}` : "",
		ze: zeMatch ? `仄：${zeMatch[1]}` : "",
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

function getQunfangUnusedOrdinaryTrickText(player) {
	const used = player
		.getRoundHistory("useCard", (evt) => {
			if (!evt.card) return false;
			if (get.type(evt.card, null, false) !== "trick") return false;
			return get.subtype(evt.card, false) !== "delay";
		})
		.map((evt) => evt.card?.name)
		.filter(Boolean);
	const list = get
		.inpileVCardList((info) => info[0] === "trick" && !used.includes(info[2]))
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
	return line ? `<span class="${cls}">${line}</span>` : "";
}

function formatXiaoyinDescription(player) {
	const base = applyXiaoyinBaseMutations(player, lib.translate.qunfang_xiaoyin_info || "");
	const { prefix, ping, ze, zhuan } = parseXiaoyinParts(base);
	const isZe = !!player.storage.qunfang_xiaoyin;
	const pingLine = ping ? (isZe ? ping : `<span class="bluetext">${ping}</span>`) : "";
	const zeLine = ze ? (isZe ? `<span class="firetext">${ze}</span>` : ze) : "";
	return `${prefix}${pingLine}${zeLine}${zhuan}`;
}

function formatLuanpeiDescription(player) {
	const base = lib.translate.qunfang_luanpei_info || "";
	const isSha = !!player.storage.qunfang_luanpei;
	return base
		.replace(/其他角色\/你①回复体力后/g, isSha ? "其他角色/你①回复体力后" : '<span class="bluetext">其他角色/你①回复体力后</span>')
		.replace(/②使用【杀】指定目标后/g, isSha ? '<span class="firetext">②使用【杀】指定目标后</span>' : "②使用【杀】指定目标后");
}

function formatFushengDescription(player) {
	const base = lib.translate.qunfang_fusheng_info || "";
	const isYin = !!player.storage.qunfang_fusheng;
	const text = base
		.replace(/阳：/g, isYin ? "阳：" : '<span class="bluetext">阳：</span>')
		.replace(/阴：/g, isYin ? '<span class="firetext">阴：</span>' : "阴：");
	const count = getQunfangFushengDiscardText(player);
	return `${text}<br>当前累计牌数：${count}；触发所需：${player.maxHp}`;
}

function formatZhenzhiDescription(player) {
	const base = lib.translate.qunfang_zhenzhi_info || "";
	return `${base}<br>当前已废除装备栏：${getQunfangDisabledSlotText(player)}<br>当前可转化的未使用普通锦囊：${getQunfangUnusedOrdinaryTrickText(player)}`;
}

const dynamicTranslates = {
	qunfang_lihu(player) {
		let base = lib.translate.qunfang_lihu_info || "";
		const mode = player.storage.qunfang_lihu_cost || "mark";
		if (mode === "hp") {
			base = base.replace(/1枚“梅影”标记/g, "1点体力").replace(/1枚"梅影"标记/g, "1点体力");
		} else if (mode === "maxHp") {
			base = base.replace(/1枚“梅影”标记/g, "1点体力上限").replace(/1枚"梅影"标记/g, "1点体力上限");
		}
		const skillNum = countLihuSkills(player);
		const hp = player.getHp();
		const target = getLihuHandTarget(player);
		const hand = player.countCards("h");
		return `${base}<br>当前手牌数：${hand}（锁定技和无标签技能数${skillNum}+体力${hp}=${target}）`;
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
			base = base.replace(/，若此牌为基本牌，你令其摸一张牌或弃一张牌/g, "");
		}
		if (player.storage.qunfang_liubo_no_equal) {
			base = base.replace(/；此【杀】结算后，若你与其手牌数相等，你可以与其各摸一张牌。?/g, "。");
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
		const nameStr = names.length ? names.map((name) => get.translation(name)).join("、") : "（无）";
		return `${base}<br>已记录牌名：${nameStr}`;
	},
	qunfang_fusheng(player) {
		return formatFushengDescription(player);
	},
	qunfang_zhenzhi(player) {
		return formatZhenzhiDescription(player);
	},
};

export default dynamicTranslates;
