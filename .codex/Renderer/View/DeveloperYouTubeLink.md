# DeveloperYouTubeLink

Source: `src/Renderer/View/PreferenceView/PreferenceView.tsx`
Story: `src/Renderer/Stories/View/PreferenceView.stories.tsx`

역할:

- PreferenceView 상단 개발자 링크 그룹 중 YouTube 버튼.
- 방송 중이면 on-air glow 효과를 표시한다.

현재 UI:

- site, github, youtube 순서의 링크 그룹 중 youtube 버튼.
- on-air 상태면 red glow, pulse dot, ON AIR label.
- off-air 상태면 일반 외부 링크 button tone.

주요 props:

- `url`
- `isOnAir`

UI 변경 지시 포인트:

- on-air/offline 문구.
- glow intensity.
- 버튼 크기와 위치.
- link group 내 순서.

유지할 계약:

- 클릭 시 외부 URL을 새 창으로 연다.
- YouTube live 상태는 props로 주입받는다.
