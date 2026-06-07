# InstalledWinePanel

Source: `src/Renderer/Component/InstalledWinePanel.tsx`
Story: `src/Renderer/Stories/Component/InstalledWinePanel.stories.tsx`

역할:

- 설치 완료 또는 설치 진행 중인 Wine version만 모아 보여주는 panel.

현재 UI:

- installed/completed/downloading/installing/extracting 상태만 표시한다.
- WineVersionCard를 리스트로 렌더링한다.
- close button을 지원한다.

주요 props:

- `wineVersions`
- `selectedWineVersionId`
- `installPath`
- `className`
- `onSelectWineVersion`
- `onClose`

UI 변경 지시 포인트:

- panel width와 sticky behavior.
- empty state.
- close button 위치.
- WineVersionCard spacing.

유지할 계약:

- 전체 Wine catalog가 아니라 visible installed wine만 보여준다.
