# XTermTerminal

Source: `src/Renderer/Component/Terminal.tsx`
Story: `src/Renderer/Stories/Component/Terminal.stories.tsx`

역할:

- `Terminal.tsx`의 default export.
- terminal UI 변경 지시는 `Terminal.md`와 이 문서 중 하나에 적으면 된다.

현재 UI:

- xterm.js 기반 terminal surface.
- dark theme, mock welcome, resize fit 처리.

주요 props:

- `className`
- `height`
- `welcomeMessage`

UI 변경 지시 포인트:

- terminal font와 색상.
- prompt 표시.
- 실제 shell/Wine log 연결.

유지할 계약:

- terminal interaction과 text selection을 유지한다.
