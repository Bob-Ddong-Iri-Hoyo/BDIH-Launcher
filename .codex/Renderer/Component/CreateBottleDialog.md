# CreateBottleDialog

Source: `src/Renderer/Component/BottleDashboard.tsx`
Story: `src/Renderer/Stories/View/MainView.stories.tsx`

역할:

- 새 Bottle을 만들기 위한 Dialog.

현재 UI:

- Dialog 컴포넌트를 사용한다.
- name, wine version, path, description field가 있다.
- random name button이 있다.
- name과 wine version이 있어야 submit 가능하다.

주요 props:

- `open`
- `wineVersions`
- `selectedWineVersionId`
- `onClose`
- `onCreateBottle`

UI 변경 지시 포인트:

- recipe 선택 field 추가.
- path picker 버튼 추가.
- random name button 위치.
- validation 메시지 표시.

유지할 계약:

- submit 시 `CreateBottleInput` shape를 유지한다.
- 닫기와 취소 동작을 유지한다.
