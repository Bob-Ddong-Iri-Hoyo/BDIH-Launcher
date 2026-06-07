# LogTextPanel

Source: `src/Renderer/Component/LogViewer.tsx`
Story: `src/Renderer/Stories/Component/LogViewer.stories.tsx`

역할:

- 선택된 로그 세션의 실제 로그 텍스트를 보여주는 read-only log body.

현재 UI:

- `pre > code` 기반.
- 스크롤 가능.
- 로그 텍스트 선택 가능.
- 로그가 없으면 placeholder 표시.

주요 props:

- `text`
- `entries`
- `placeholder`

UI 변경 지시 포인트:

- line wrapping 여부.
- font size와 line height.
- empty state.
- selection 색상.

유지할 계약:

- terminal/log 본문은 텍스트 선택이 가능해야 한다.
