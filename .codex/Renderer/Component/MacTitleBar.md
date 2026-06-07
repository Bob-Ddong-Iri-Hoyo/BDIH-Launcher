# MacTitleBar

Source: `src/Renderer/Component/MacTitleBar.tsx`
Story: `src/Renderer/Stories/Component/MacTitleBar.stories.tsx`

역할:

- frameless macOS window용 custom title bar.

현재 UI:

- 좌측 traffic light buttons.
- 중앙 title.
- optional rightSlot.
- quit/minimize/maximize callbacks.

주요 props:

- `title`
- `rightSlot`
- `className`
- `onQuit`
- `onMinimize`
- `onMaximize`

UI 변경 지시 포인트:

- title 위치.
- traffic light 크기와 icon 노출 방식.
- draggable area.
- rightSlot 배치.

유지할 계약:

- macOS window control 의미는 유지한다.
