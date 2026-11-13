import { activeProvider } from "@/llm/index";
import { AppVoice } from "./AppVoice";

/** LLM이 mock일 때만 보이는 개발 전용 배너. 출시 금지 표시. */
export function DevBanner() {
  if (activeProvider() !== "mock") return null;
  return <AppVoice screen="dev_banner">개발 모드: LLM mock 응답을 씁니다. 출시 빌드에서는 보이면 안 됩니다.</AppVoice>;
}
