# ContextMenu

Source: `src/Renderer/Component/ContextMenu.tsx`
Story: `src/Renderer/Stories/Component/ContextMenu.stories.tsx`

역할:

- Bottle card 등에서 사용하는 custom context menu.
- 화면 좌표 기반으로 열리고 viewport 밖으로 넘치지 않게 위치를 보정한다.

현재 UI:

- fixed overlay menu.
- item icon, label, danger tone, disabled state, separator 지원.
- outside click과 Escape로 닫는다.

주요 props:

- `open`
- `position`
- `items`
- `onClose`
- `width`

UI 변경 지시 포인트:

- menu width, padding, item height.
- danger item 색상.
- separator 스타일.
- animation과 shadow.

유지할 계약:

- disabled item은 실행되지 않아야 한다.
- danger는 시각적으로 구분되어야 한다.
- viewport overflow 보정은 유지한다.
