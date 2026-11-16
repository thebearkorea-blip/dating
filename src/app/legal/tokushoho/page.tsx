// 初稿 — 専門家確認前
import { notFound } from "next/navigation";
import { getProduct } from "@/product";
import { LegalShell, PH } from "../_shell";

// 住所・電話番号は「請求があった場合に遅滞なく開示する」方式(特定商取引法施行規則の特例)を選ぶ道もある。
// 採用するかは未決定。採用する場合は該当行を「請求があった場合、遅滞なく開示いたします」に差し替える。
const ROWS: [string, string][] = [
  ["販売事業者", PH],
  ["運営統括責任者", PH],
  ["所在地", `${PH}(請求があった場合に遅滞なく開示する方式を採るかは未決定)`],
  ["電話番号", `${PH}(請求があった場合に遅滞なく開示する方式を採るかは未決定)`],
  ["メールアドレス", PH],
  ["販売価格", "月額1,480円(税込)"],
  ["商品代金以外の必要料金", "インターネット接続に必要な通信料はお客様のご負担となります。"],
  ["支払方法", "クレジットカード"],
  ["支払時期", "お申し込み時に初回のお支払いが発生し、以後は毎月、同日に自動更新されます。"],
  ["サービスの提供時期", "お申し込みの手続き完了後、直ちにご利用いただけます。"],
  [
    "返品・キャンセル",
    "デジタルサービスの性質上、お支払い済みの料金の返金はお受けしておりません。解約は設定画面からいつでも行えます。解約後も、お支払い済みの期間の終了日までは引き続きご利用いただけます。",
  ],
  ["動作環境", "最新版の主要ブラウザ(iOS Safari、Android Chrome など)。プッシュ通知にはブラウザの通知許可が必要です。"],
];

export default function Tokushoho() {
  if (getProduct() !== "jp") notFound();
  return (
    <LegalShell title="特定商取引法に基づく表記" placeholders={ROWS.map(([, v]) => v)}>
      <dl className="flex flex-col gap-3 text-sm">
        {ROWS.map(([k, v]) => (
          <div key={k}>
            <dt className="font-semibold">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </LegalShell>
  );
}
