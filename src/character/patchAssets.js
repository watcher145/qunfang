import { lib } from "noname";

/**
 * 立绘：extension/群芳/image/character/{武将id}.jpg
 * 阵亡配音：extension/群芳/audio/die/{武将id}.mp3
 */
export function patchCharacterAssets(characters) {
	for (const id of Object.keys(characters)) {
		characters[id].img = lib.assetURL + `extension/群芳/image/character/${id}.jpg`;
		characters[id].dieAudios = [`ext:群芳/audio/die/${id}.mp3`];
	}
}
