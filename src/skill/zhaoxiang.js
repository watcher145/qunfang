/**
 * 赵襄技能
 */
import { lib, game, get, ui, _status } from "noname";

const MEIYING_MARK = "qunfang_meiying";

/** 锁定技或无标签技能：排除子/装备/卡牌/规则技、charlotte 与梅影 */
function countLihuSkill(player) {
	return player.getSkills(null, false, false).filter((skill) => {
		if (skill === MEIYING_MARK) {
			return false;
		}
		const info = get.info(skill);
		if (!info) {
			return false;
		}
		if (info.sub || info.equipSkill || info.cardSkill || info.ruleSkill || info.charlotte) {
			return false;
		}
		return get.is.locked(skill, player) || get.skillCategoriesOf(skill, player).length === 0;
	}).length;
}

export function countLihuSkills(player) {
	const count = get.info("qunfang_lihu")?.countSkill;
	if (typeof count === "function") {
		return count(player);
	}
	return countLihuSkill(player);
}

export function getLihuHandTarget(player) {
	return countLihuSkills(player) + player.getHp();
}

function initMeiyingMarks(player) {
	if (player.storage.qunfang_dunfu_mark_init) {
		return;
	}
	player.storage.qunfang_dunfu_mark_init = true;
	const num = player.maxHp;
	if (num > 0) {
		player.addMark(MEIYING_MARK, num, false);
	}
}

export function refreshLihuUI(player) {
	if (!player.hasSkill("qunfang_lihu", null, false, false)) {
		return;
	}
	player.markSkill("qunfang_lihu");
}

/** 将手牌数同步至「锁定技和无标签技能数+当前体力」，末尾再校正防止多摸一张未弃 */
async function syncLihuHand(player) {
	if (player.storage.qunfang_lihu_syncing) {
		return;
	}
	player.storage.qunfang_lihu_syncing = true;
	try {
		const target = getLihuHandTarget(player);
		let diff = target - player.countCards("h");
		if (diff > 0) {
			await player.draw(diff);
			diff = target - player.countCards("h");
		}
		if (diff < 0) {
			await player.chooseToDiscard("h", true, -diff, "allowChooseAll");
		}
		refreshLihuUI(player);
	} finally {
		delete player.storage.qunfang_lihu_syncing;
	}
}

function isLihuSyncCardLoop(event) {
	let parent = event;
	for (let i = 0; i < 4; i++) {
		parent = parent.getParent("qunfang_lihu_sync_card");
		if (!parent || parent.name != "qunfang_lihu_sync_card") {
			return false;
		}
	}
	return true;
}

/** 玩家成功抵消黑色牌（shaMiss / eventNeutralized，判定被抵消的牌） */
function isBlackRespondOffset(event, player, triggername) {
	if (triggername === "shaMiss") {
		if (event.type !== "card" || event.target !== player) {
			return false;
		}
		const card = event.cards?.[0] || event.card;
		return !!card && get.color(card, player) === "black";
	}
	if (triggername === "eventNeutralized") {
		if (event.type !== "card" && event.name !== "_wuxie") {
			return false;
		}
		const evt = event._neutralize_event;
		if (!evt || evt.player !== player) {
			return false;
		}
		const card = evt.card || evt.cards?.[0] || event.cards?.[0] || event.card;
		return !!card && get.color(card, player) === "black";
	}
	return false;
}

/** 牌结算结束后：红色且本次使用未造成伤害 */
function isRedUseNoDamage(event, player) {
	if (event.name !== "useCard" || !event.card || get.color(event.card, player) !== "red") {
		return false;
	}
	return !player.hasHistory("sourceDamage", (evt) => evt.card === event.card && evt.getParent("useCard") === event);
}

async function payLihuCost(player) {
	const mode = player.storage.qunfang_lihu_cost || "mark";
	if (mode === "mark") {
		if (!player.hasMark(MEIYING_MARK)) {
			return false;
		}
		player.removeMark(MEIYING_MARK, 1);
		return true;
	}
	if (mode === "hp") {
		if (player.hp <= 0) {
			return false;
		}
		await player.loseHp(1);
		return true;
	}
	if (mode === "maxHp") {
		if (player.maxHp <= 0) {
			return false;
		}
		await player.loseMaxHp();
		return true;
	}
	return false;
}

async function lihuJuedou(player) {
	if (!(await payLihuCost(player))) {
		return;
	}
	const result = await player.chooseToDiscard(1, "he", true).forResult();
	if (!result?.bool || !result.cards?.length) {
		return;
	}
	if (!player.hasUseTarget({ name: "juedou", isCard: true }, false)) {
		return;
	}
	await player
		.chooseUseTarget({ name: "juedou", isCard: true }, true, false, "沥护：请选择【决斗】的目标")
		.set("logSkill", "qunfang_lihu");
	refreshLihuUI(player);
}

function getShuCharacterList() {
	let list;
	if (_status.characterlist) {
		list = [];
		for (const name of _status.characterlist) {
			if (lib.character[name][1] == "shu") {
				list.push(name);
			}
		}
	} else if (_status.connectMode) {
		list = get.charactersOL((i) => lib.character[i][1] != "shu");
	} else {
		list = get.gainableCharacters((info) => info[1] == "shu");
	}
	const players = game.players.concat(game.dead);
	for (const current of players) {
		list.remove(current.name);
		list.remove(current.name1);
		list.remove(current.name2);
	}
	list.remove("zhaoyun");
	list.remove("re_zhaoyun");
	list.remove("ol_zhaoyun");
	return list.randomGets(Math.max(4, game.countPlayer()));
}

export const qunfangZhaoxiangSkills = {
	qunfang_meiying: {
		charlotte: true,
		marktext: "影",
		intro: {
			content: "mark",
			name: "梅影",
			name2: "梅影",
		},
	},
	qunfang_fuhan: {
		audio: 2,
		trigger: { player: "phaseZhunbeiBegin" },
		limited: true,
		skillAnimation: true,
		animationColor: "orange",
		filter(event, player) {
			return player.countMark(MEIYING_MARK) > 0;
		},
		check: () => true,
		async content(event, trigger, player) {
			const num = player.countMark(MEIYING_MARK);
			if (num) {
				await player.draw(num);
			}
			player.removeMark(MEIYING_MARK, num);
			player.awakenSkill(event.name);
			const list = getShuCharacterList();
			if (!list.length) {
				return;
			}
			let num2 = 0;
			const skillMap = {};
			for (const name of list) {
				const skills = (lib.character[name][3] || []).filter((skill) => {
					const info = get.info(skill);
					return (
						info &&
						!info.zhuSkill &&
						!info.limited &&
						!info.juexingji &&
						!info.hiddenSkill &&
						!info.charlotte &&
						!info.dutySkill
					);
				});
				if (skills.length > num2) {
					num2 = skills.length;
				}
				skillMap[name] = skills;
			}
			if (num2 == 0) {
				return;
			}
			const result = await player
				.chooseButton(
					[
						[["扶汉：请选择获得至多两个技能"], "addNewRow"],
						[
							(dialog) => {
								const { list: charList, skillMap: map } = get.event();
								const column = Math.min(charList.length, 8);
								if (column > 6) {
									dialog.css({ width: "100%", left: 0 });
								}
								const contentx = ui.create.div(".content", dialog.content);
								contentx.css({
									display: "grid",
									gridTemplateColumns: `repeat(${column}, 1fr)`,
									width: "fit-content",
									margin: "auto",
								});
								for (const i of charList) {
									const div = ui.create.div(".buttons", contentx);
									const button = ui.create.button(i, "character", div);
									const skills = map[i];
									div.css({
										display: "flex",
										flexDirection: "column",
										alignItems: "center",
									});
									button.style.setProperty("opacity", "1", "important");
									if (skills.length) {
										const buttons = ui.create.buttons(
											skills.map((s) => [s, get.translation(s)]),
											"tdnodes",
											div
										);
										dialog.buttons = dialog.buttons.concat(buttons);
									}
								}
							},
							"handle",
						],
					],
					[1, 2],
					true
				)
				.set("list", list.slice())
				.set("skillMap", skillMap)
				.set("ai", (button) => get.skillRank(button.link, "inout"))
				.forResult();
			if (result?.links?.length) {
				await player.addSkills(result.links);
			}
			if (player.isMinHp()) {
				await player.recover();
			}
		},
	},
	qunfang_lihu: {
		audio: 2,
		locked: true,
		mark: true,
		countSkill: countLihuSkill,
		intro: {
			content(storage, player) {
				const skillNum = lib.skill.qunfang_lihu.countSkill(player);
				const hp = player.getHp();
				const target = skillNum + hp;
				const hand = player.countCards("h");
				return `当前手牌数：${hand}（锁定技和无标签技能数${skillNum}+体力${hp}=${target}）`;
			},
		},
		init(player) {
			player.storage.qunfang_lihu_cost ??= "mark";
			refreshLihuUI(player);
		},
		group: [
			"qunfang_lihu_sync_card",
			"qunfang_lihu_sync_less",
			"qunfang_lihu_sync_more",
			"qunfang_lihu_respond",
			"qunfang_lihu_use",
		],
		subSkill: {
			sync_card: {
				audio: "qunfang_lihu",
				sourceSkill: "qunfang_lihu",
				trigger: {
					player: "loseAfter",
					global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
				},
				forced: true,
				popup: false,
				filter(event, player) {
					const target = getLihuHandTarget(player);
					const count = player.countCards("h");
					if (event.name === "gain" && event.player === player) {
						return count > target;
					}
					const evt = event.getl(player);
					if (!evt?.hs?.length || count >= target) {
						return false;
					}
					return !isLihuSyncCardLoop(event);
				},
				async content(event, trigger, player) {
					await syncLihuHand(player);
				},
			},
			sync_less: {
				audio: "qunfang_lihu",
				sourceSkill: "qunfang_lihu",
				trigger: { player: ["changeHp", "addSkill"] },
				forced: true,
				popup: false,
				filter(event, player) {
					if (event.name === "changeHp" && (event.num ?? 0) <= 0) {
						return false;
					}
					return player.countCards("h") !== getLihuHandTarget(player);
				},
				async content(event, trigger, player) {
					await syncLihuHand(player);
				},
			},
			sync_more: {
				audio: "qunfang_lihu",
				sourceSkill: "qunfang_lihu",
				trigger: { player: ["changeHp", "loseHp", "removeSkill"] },
				forced: true,
				popup: false,
				filter(event, player) {
					if (event.name === "changeHp" && (event.num ?? 0) >= 0) {
						return false;
					}
					return player.countCards("h") !== getLihuHandTarget(player);
				},
				async content(event, trigger, player) {
					await syncLihuHand(player);
				},
			},
		},
	},
	qunfang_lihu_respond: {
		audio: "qunfang_lihu",
		locked: true,
		trigger: { player: ["shaMiss", "eventNeutralized"] },
		forced: true,
		popup: false,
		filter(event, player, name) {
			return isBlackRespondOffset(event, player, name);
		},
		async content(event, trigger, player) {
			await lihuJuedou(player);
		},
	},
	qunfang_lihu_use: {
		audio: "qunfang_lihu",
		locked: true,
		trigger: { player: "useCardAfter" },
		forced: true,
		popup: false,
		filter(event, player) {
			return isRedUseNoDamage(event, player);
		},
		async content(event, trigger, player) {
			await lihuJuedou(player);
		},
	},
	qunfang_dunfu: {
		audio: 2,
		dutySkill: true,
		init(player) {
			player.storage.qunfang_dunfu_done ??= false;
			player.storage.qunfang_lihu_cost ??= "mark";
			initMeiyingMarks(player);
		},
		group: ["qunfang_dunfu_mark", "qunfang_dunfu_achieve", "qunfang_dunfu_fail"],
		subSkill: {
			mark: {
				audio: "qunfang_dunfu",
				trigger: {
					global: "phaseBefore",
					player: "enterGame",
				},
				forced: true,
				popup: false,
				filter(event, player) {
					if (player.storage.qunfang_dunfu_mark_init) {
						return false;
					}
					return event.name !== "phase" || game.phaseNumber === 0;
				},
				content(event, trigger, player) {
					initMeiyingMarks(player);
				},
			},
			achieve: {
				audio: "qunfang_dunfu",
				trigger: { player: "dying" },
				forced: true,
				forceDie: true,
				skillAnimation: true,
				animationColor: "fire",
				filter(event, player) {
					return !player.storage.qunfang_dunfu_done && player.countMark(MEIYING_MARK) > 0;
				},
				async content(event, trigger, player) {
					player.storage.qunfang_dunfu_done = true;
					player.awakenSkill("qunfang_dunfu");
					game.log(player, "成功完成使命");
					await player.addSkills("qunfang_fuhan");
					player.storage.qunfang_lihu_cost = "hp";
					refreshLihuUI(player);
					await player.recoverTo(1);
					refreshLihuUI(player);
					const turnPlayer = _status.currentPhase;
					if (turnPlayer) {
						player.storage.qunfang_dunfu_extra_turn = turnPlayer;
						player.addSkill("qunfang_dunfu_extra");
					}
				},
			},
			fail: {
				audio: "qunfang_dunfu",
				trigger: { player: "dying" },
				forced: true,
				forceDie: true,
				skillAnimation: true,
				animationColor: "gray",
				filter(event, player) {
					return !player.storage.qunfang_dunfu_done && player.countMark(MEIYING_MARK) <= 0;
				},
				async content(event, trigger, player) {
					player.storage.qunfang_dunfu_done = true;
					player.awakenSkill("qunfang_dunfu");
					game.log(player, "使命失败");
					await player.addSkills("relonghun");
					player.storage.qunfang_lihu_cost = "maxHp";
					refreshLihuUI(player);
					await player.recoverTo(1);
					refreshLihuUI(player);
					const turnPlayer = _status.currentPhase;
					if (turnPlayer) {
						player.storage.qunfang_dunfu_extra_turn = turnPlayer;
						player.addSkill("qunfang_dunfu_extra");
					}
				},
			},
		},
	},
	qunfang_dunfu_extra: {
		charlotte: true,
		forced: true,
		popup: false,
		trigger: { global: "phaseEnd" },
		filter(event, player) {
			const turn = player.storage.qunfang_dunfu_extra_turn;
			return turn && event.player === turn;
		},
		content(event, trigger, player) {
			delete player.storage.qunfang_dunfu_extra_turn;
			player.removeSkill("qunfang_dunfu_extra");
			game.log(player, "执行了一个额外回合");
			player.insertPhase("qunfang_dunfu");
		},
	},
};
