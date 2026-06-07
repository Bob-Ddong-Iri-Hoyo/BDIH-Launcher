# MainFrame

Source: `src/Renderer/Component/MainFrame.tsx`
Story: `src/Renderer/Stories/Component/MainFrame.stories.tsx`

역할:

- 앱 전체 shell.
- sidebar navigation, header, title/subtitle, actions, content frame을 제공한다.

현재 UI:

- 왼쪽 sidebar에 dashboard/logs/preferences navigation.
- 상단 header에 title, subtitle, optional leading, action controls.
- content 영역에 active view를 렌더링한다.
- sidebar 하단 status panel은 제거된 상태다.

주요 props:

- `title`
- `subtitle`
- `logoSrc`
- `activeView`
- `titleBar`
- `headerLeading`
- `actions`
- `onViewChange`

UI 변경 지시 포인트:

- sidebar width와 nav item density.
- header title/subtitle layout.
- Bottle detail일 때 header leading 위치.
- titleBar 통합 방식.

유지할 계약:

- navigation item은 dashboard/logs/preferences key를 사용한다.
- content area는 View가 자유롭게 채운다.
