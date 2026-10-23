import type { NightnovaTaskTemplate } from '../../shared/nightnova'

export const NIGHTNOVA_TASK_TEMPLATES: NightnovaTaskTemplate[] = [
  {
    id: 'feature-batch', title: '기능 묶음 개발',
    instruction: '현재 저장소의 미완성 핵심 기능을 우선순위에 따라 구현하라. 기존 변경사항을 보존하고, 관련 UI/로직/설정을 함께 연결하라. 구현 후 실제 변경 파일과 남은 장애 요인을 요약하라.',
    expectChanges: true
  },
  {
    id: 'fix-runtime', title: '실행 장애 수정',
    instruction: '현재 애플리케이션의 시작·연결·실제 사용 흐름에서 막히는 구조적 장애를 찾고 수정하라. 불필요한 전역 회귀 테스트를 반복하지 말고, 핵심 경로를 작동 가능하게 만드는 데 집중하라.',
    expectChanges: true
  },
  {
    id: 'ui-polish', title: '사용성 개선',
    instruction: '핵심 UI에서 입력, 오류 복구, 로딩 상태, 작은 창 크기와 키보드 접근성 문제를 기능 중심으로 개선하라. 외관만 바꾸지 말고 실제 조작 흐름을 연결하라.',
    expectChanges: true
  },
  {
    id: 'handoff', title: '인계 문서 정리',
    instruction: '현재 구현 상태, 작업 중 파일, 남은 우선순위와 로컬 재개 방법을 재현 가능하게 정리하라. 실제 사실과 미검증 가정을 명확히 분리하라. 문서를 저장소 안에 작성하라.',
    expectChanges: true
  },
  {
    id: 'review-only', title: '읽기 전용 분석',
    instruction: '현재 저장소 상태를 읽기 전용으로 평가하고, 실행 가능한 우선순위 작업 목록과 근거를 제시하라. 소스·설정·배포를 변경하지 마라.',
    expectChanges: false
  }
]
