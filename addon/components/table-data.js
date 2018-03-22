import { A } from '@ember/array';
import { assert } from '@ember/debug';
import Component from '@ember/component';
import { observer, computed, get } from '@ember/object';
import { inject as service } from '@ember/service';
import QueryObj from '../utils/query-obj';
import layout from '../templates/components/table-data';
import SortStates from '../utils/sort-states';
import { isPresent } from '@ember/utils';

export default Component.extend({
  layout,

  tableData: service(),

  queryObj: null,
  _queryObj: null,

  eagerLoading: true,
  updatePageAfter: 10,

  loadedPages: null,
  totalCount: null,
  _totalCount:0,

  init() {
    this._super(...arguments);
    if (!this.get('records'))
      assert('table-data: the property "records" must be passed.');

    this.set('loadedPages', new A());
    this.resetQueryObj(this.get('queryObj'));
  },

  resetLoadedPages: observer('records', 'records.[]', '_queryObj.pageSize', function() {
    this.get('loadedPages').clear();
    this.send('updatePage', 1);
  }),

  resetQueryObj(queryObj) {
    // Create the query object from the one that user can pass when declaring table data component
    let query = QueryObj.create(queryObj);
    let totalCount = this.get('totalCount');

    if ((isPresent(queryObj) && !isPresent(totalCount)) || (!isPresent(query) && isPresent(totalCount)))
    {
      assert('table-data: If you pass either "queryObj" or "totalCount" param, both should be pass.')
    }

    if (totalCount){
      this.set('_totalCount', totalCount);
    }

    this.set('_queryObj', query);
  },

  pageRecords: computed('_queryObj.{currentPage,pageSize,filters.[],sorts.[]}', function() {
    let currentPage = this.get('_queryObj.currentPage');
    let onDataChange = true;
    let loadedPage = this.loadPage(currentPage, onDataChange);

    let records = loadedPage.get('records');
    records.then(data => {
      if (!data.get) {
        data = A(data);
      }
      if (this.get('eagerLoading')) {
        let pageNumber = loadedPage.get('page');
        this.loadPage(pageNumber - 1);
        this.loadPage(pageNumber + 1);
      }
    })
    return records
  }),
  shouldReloadPage(loadedPage) {
    if (!loadedPage.get('forceReload')){
      let lastUpdated = loadedPage.get('lastUpdated');
      let now = Date.now();
      let diffInMin = (lastUpdated - now) / 1000 / 60;
      let maxDiffInMin = this.get('updatePageAfter')
      return diffInMin >= maxDiffInMin;
    }

    return true;
  },

  updateTotalCount(loadedPage, data) {
    if (get(data, 'meta.totalCount')) {
      this.set('_totalCount', get(data, 'meta.totalCount'));
      loadedPage.set('totalCount', get(data, 'meta.totalCount'));
    } else {
      if (data.get){
      this.set('_totalCount', data.get('length'));
      loadedPage.set('totalCount', data.get('length'));
    } else
      {
        this.set('_totalCount', data.length);
        loadedPage.set('totalCount', data.length);
      }
    }
  },
  triggerOnDataChangeAction(queryObj, onDataChange, onDataChangeClosureAction, totalCount){
    if (onDataChange && onDataChangeClosureAction){
      onDataChangeClosureAction(queryObj, totalCount);
    }
  },

  loadPage(page, onDataChange) {
    let service = this.get('tableData');
    let pageSize = this.get('_queryObj.pageSize');
    let totalCount = this.get('_totalCount');

    if (service.isPossiblePage(page, pageSize, totalCount)) {
      let loadedPages = this.get('loadedPages');
      let loadedPage = loadedPages.findBy('page', page);
      let shoudLoadPage = !loadedPage ||
        !this.get('eagerLoading') ||
        this.shouldReloadPage(loadedPage);

      let onDataChangeClosureAction = this.get('onDataChange');

      if (shoudLoadPage) {
        loadedPages.removeObject(loadedPage);

        let records = this.get('records');
        let queryObj = QueryObj.create(this.get('_queryObj'));
        queryObj.set('currentPage', page);

        loadedPage = service.loadPage(records, queryObj);
        loadedPage.get('records').then(data => {
          this.updateTotalCount(loadedPage, data);
          this.triggerOnDataChangeAction(queryObj,onDataChange, onDataChangeClosureAction, totalCount);
        });
        loadedPage.set('forceReload', false);
        loadedPages.pushObject(loadedPage);

        queryObj.destroy();
      } else {
        this.triggerOnDataChangeAction(this.get('_queryObj'), onDataChange, onDataChangeClosureAction, totalCount);
      }      
      return loadedPage;
    }
  },

  sortStates: SortStates.create(),

  forceReload(page) {
    let pageToReload = page || this.get('_queryObj.currentPage');
    let loadedCurrentPage = this.get('loadedPages').findBy('page', pageToReload);
    loadedCurrentPage.set('forceReload', true);
  },

  actions: {
    updateSort(property) {
      let sortStates = this.get('sortStates');

      sortStates.changeState(property);

      this.forceReload();

      this.set('_queryObj.sorts', sortStates.getSortArray());
    },
    updatePageSize(pageSize) {
      this.set('_queryObj.pageSize', pageSize);
    },
    updatePage(page) {
      this.set('_queryObj.currentPage', page);
    },
    refreshPage(page) {
      this.forceReload(page);
      this.notifyPropertyChange('_queryObj.currentPage');
    },
    updateFilter(filters){
      this.resetLoadedPages();
      this.set('_queryObj.filters', filters);
    }
  }
});
