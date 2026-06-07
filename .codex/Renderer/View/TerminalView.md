# TerminalView

Source: `src/Renderer/View/TerminalView/App.tsx`
Component: `src/Renderer/Component/Terminal.tsx`
Story: `src/Renderer/Stories/Component/Terminal.stories.tsx`

역할:

- Terminal 단독 window entry view.

현재 UI:

- full screen dark background.
- XTermTerminal을 중앙 content로 렌더링한다.

UI 변경 지시 포인트:

- terminal window padding.
- terminal height.
- standalone terminal header 추가 여부.
- App log / Bottle Wine log와 terminal을 분리할지.

유지할 계약:

- 실제 terminal surface 변경은 `Component/Terminal.md`를 우선 수정한다.
