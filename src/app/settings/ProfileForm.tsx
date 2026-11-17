"use client";
import { useState } from "react";
import { CITIES } from "../onboarding/cities";
import { saveProfile } from "./actions";

/** 이름·도시 수정. 도시를 바꾸면 시간대가 자동으로 맞춰진다("Other"는 브라우저 시간대). 생년은 수정 불가. */
export function ProfileForm({ displayName, city, labels }: { displayName: string; city: string | null; labels: { name: string; city: string; save: string; cities: Record<string, string> } }) {
  const [selected, setSelected] = useState(city ?? "seoul");
  const browserTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
  return (
    <form action={saveProfile} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span>{labels.name}</span>
        <input name="displayName" defaultValue={displayName} required maxLength={40} className="field" />
      </label>
      <label className="flex flex-col gap-1">
        <span>{labels.city}</span>
        <select name="city" value={selected} onChange={(e) => setSelected(e.target.value)} className="field">
          {CITIES.map((c) => (
            <option key={c.id} value={c.id}>
              {labels.cities[c.id]}
            </option>
          ))}
        </select>
      </label>
      {selected === "other" ? <input type="hidden" name="tz" value={browserTz} /> : null}
      <button type="submit" className="btn">
        {labels.save}
      </button>
    </form>
  );
}
