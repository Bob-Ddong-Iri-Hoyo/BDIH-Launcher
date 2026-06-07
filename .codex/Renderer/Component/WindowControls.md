# WindowControls

Source: `src/Renderer/Component/WindowControls.tsx`
Story: `src/Renderer/Stories/Component/WindowControls.stories.tsx`

역할:

- non-mac title/header 영역에서 쓰는 window action controls.

현재 UI:

- optional refresh, minimize, maximize, quit buttons.
- lucide icons 사용.
- quit은 danger tone.

주요 props:

- `onRefresh`
- `onMinimize`
- `onMaximize`
- `onQuit`
- `className`

UI 변경 지시 포인트:

- refresh 제거/복구.
- icon size.
- button hit area.
- danger hover style.

유지할 계약:

- window action은 icon button으로 유지한다.
