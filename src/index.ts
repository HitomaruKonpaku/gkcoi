import {
  generateDarkFleetCanvasAsync,
  generateDarkAirbaseCanvasAsync,
  generateDarkParameterCanvasAsync,
  generateDarkExpeditionStatsCanvasAsync,
} from "./theme/dark";
import { parse, Ship, DeckBuilder, Speed, LoS, MasterData } from "./type";
import { getLoSValue, fetchStart2, MASTER_URL } from "./utils";
import { generate74eoLargeCardFleetCanvasAsync } from "./theme/74eoLC";
import { generate74eoMediumCutinFleetCanvasAsync } from "./theme/74eoMC";
import { generate74eoSmallBannerFleetCanvasAsync } from "./theme/74eoSB";
import { Canvas, createCanvas2D, fetchImage } from "./canvas";
import { stick } from "./stick";
import { generateOfficialFleetCanvasAsync } from "./theme/official";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const steg = require("./steganography.js");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const lzjs = require("lzjs");

export {
  DeckBuilder,
  DeckBuilderFleet,
  DeckBuilderShip,
  DeckBuilderItem,
  DeckBuilderAirbase,
} from "./type";

async function createAsync(
  deckbuilder: DeckBuilder,
  options: {
    start2URL: string;
    shipURL: string;
  }
): Promise<Canvas> {
  const start2: MasterData = await fetchStart2(options.start2URL);
  const { lang, theme, hqlv, fleets, airbases, airState, comment } = parse(
    deckbuilder,
    start2,
    options.shipURL
  );
  const has5slot = fleets.some(({ ships }) =>
    ships.some((ship) => ship.slotNum === 5)
  );
  const fimage = stick(
    await Promise.all(
      fleets
        .filter((v, i) => (theme === "dark-ex" ? i === 0 : true))
        .map(async ({ ships, name }: { ships: Ship[]; name: string }, i) => {
          const los: LoS = {
            1: getLoSValue(ships, hqlv, 1),
            2: getLoSValue(ships, hqlv, 2),
            3: getLoSValue(ships, hqlv, 3),
            4: getLoSValue(ships, hqlv, 4),
            5: getLoSValue(ships, hqlv, 5),
          };
          const airPower = ships
            .filter((ship) => ship.id > 0)
            .map((ship) => ship.airPower)
            .reduce(
              (previous, airpower) => {
                previous.min += airpower.min;
                previous.max += airpower.max;
                return previous;
              },
              {
                min: 0,
                max: 0,
              }
            );
          const speed: Speed = ships
            .filter((ship) => ship.id > 0)
            .map((ship) => ship.speed)
            .reduce(
              (previous, speed) => (previous > speed ? speed : previous),
              20
            );

          switch (theme) {
            case "dark":
            case "dark-ex":
              return await generateDarkFleetCanvasAsync(
                i,
                ships,
                los,
                airPower,
                speed,
                lang
              );
            case "74lc":
              return await generate74eoLargeCardFleetCanvasAsync(
                name,
                ships,
                los,
                airPower,
                lang
              );
            case "74mc":
              return await generate74eoMediumCutinFleetCanvasAsync(
                name,
                ships,
                los,
                airPower,
                lang,
                has5slot
              );
            case "74sb":
              return await generate74eoSmallBannerFleetCanvasAsync(
                name,
                ships,
                los,
                airPower,
                lang,
                has5slot
              );
            case "official":
              return await generateOfficialFleetCanvasAsync(ships, lang);
          }
        })
    ),
    ["74lc", "74sb", "official"].includes(theme) ||
      fleets.filter(({ ships }) => ships.length > 0).length > 2
      ? 2
      : 1,
    theme === "dark" ? "#212121" : theme === "official" ? "#ece3d7" : "white"
  );
  if (theme === "dark-ex") {
    const eimage = await generateDarkExpeditionStatsCanvasAsync(
      fleets[0].ships,
      lang
    );
    const { canvas, ctx } = createCanvas2D(
      fimage.width + eimage.width + 2,
      fimage.height
    );
    ctx.fillStyle = "#212121";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(fimage, 0, 0);
    ctx.drawImage(eimage, fimage.width + 2, 0);
    return canvas;
  }
  const useAirbase = airbases
    .map(({ items }) => items)
    .some((items) => items.some(({ id }) => id > 0));
  if (theme === "dark" && useAirbase) {
    const aimage = await generateDarkAirbaseCanvasAsync(airbases, lang);
    const { canvas, ctx } = createCanvas2D(
      fimage.width + aimage.width + 2,
      fimage.height
    );
    ctx.fillStyle = "#212121";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(fimage, 0, 0);
    ctx.drawImage(aimage, fimage.width + 2, 0);
    if (fleets.length > 1) {
      const pimage = await generateDarkParameterCanvasAsync(
        [fleets[0].ships, fleets[1].ships].flat(),
        airState,
        comment,
        lang
      );
      ctx.drawImage(pimage, fimage.width + 2, aimage.height);
    }
    return canvas;
  }
  return fimage;
}

function encodeAsync(data: string, url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    steg.encode(data, url, {
      success: (value: string) => resolve(value),
      error: (e: string) => reject(e),
    });
  });
}

function decodeAsync(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    steg.decode(url, {
      success: (value: string) => resolve(value),
      error: (e: string) => reject(e),
    });
  });
}

/**
 * 画像を生成する
 * @param deckbuilder フォーマット
 * @param options 画像取得オプション
 * @return 編成画像
 */
export async function generate(
  deckbuilder: DeckBuilder,
  options: {
    start2URL: string;
    shipURL: string;
  } = {
    start2URL: `${MASTER_URL}/START2.json`,
    shipURL: `${MASTER_URL}/ship`,
  }
): Promise<Canvas> {
  const original = await createAsync(deckbuilder, options);
  const src = await encodeAsync(
    lzjs.compress(JSON.stringify(deckbuilder)),
    original.toDataURL()
  );
  const { canvas, ctx } = createCanvas2D(original.width, original.height);
  ctx.drawImage(await fetchImage(src), 0, 0);
  return canvas;
}

/**
 * 画像をデコードして情報を取り出す
 * @param src ソース
 * @return フォーマット
 */
export async function decode(src: string): Promise<string> {
  return JSON.parse(lzjs.decompress(await decodeAsync(src)));
}
