# AppUpdatePanel

Source: `src/Renderer/Component/AppUpdatePanel.tsx`
Story: `src/Renderer/Stories/Component/AppUpdatePanel.stories.tsx`

역할:

- 앱 업데이트 상태와 자동 업데이트 on/off를 보여주는 설정 패널.
- 현재는 PreferenceView의 General 섹션 안에서 사용한다.

현재 UI:

- 패널 헤더에 업데이트 상태 badge와 설명을 표시한다.
- 자동 업데이트 toggle/checkbox가 있다.
- 수동 업데이트 확인 버튼이 있다.
- `checking`, `available`, `downloading`, `downloaded`, `error`, `idle` 상태를 tone과 icon으로 구분한다.

주요 props:

- `autoUpdateEnabled`: 자동 업데이트 사용 여부.
- `status`: 업데이트 상태 payload.
- `onAutoUpdateChange`: 자동 업데이트 변경 콜백.
- `onCheckForUpdates`: 수동 확인 콜백.

UI 변경 지시 포인트:

- 업데이트 상태를 더 작게/크게 보일지.
- 자동 업데이트 토글 위치.
- 버튼 문구, 아이콘, 강조 색상.
- 다운로드 진행률 표시 방식.

유지할 계약:

- 자동 업데이트는 binary setting이다.
- 수동 확인은 명확한 button으로 남긴다.
